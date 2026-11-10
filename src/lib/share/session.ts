import type { Room } from 'trystero';
import { generateId } from '@/lib/utils/fileUtils';
import { readChunks } from './chunking';
import { discoverPublicIp, roomIdForIp } from './room';
import { getShareConfig } from './servers';
import type { FileSink, IncomingFileMeta, SinkFactory } from './sinks';
import { InOrderBuffer } from './transfer';

const APP_ID = 'localkit-share';
/** How long a sender waits for the receiver to tap Accept or Decline. */
const OFFER_TIMEOUT_MS = 5 * 60_000;
const HELLO_TIMEOUT_MS = 10_000;

export interface Peer {
  id: string;
  name: string;
}

type Profile = { name: string };
type FileMeta = { name: string; size: number; type: string };
type Offer = { transferId: string; files: FileMeta[] };
type ChunkMeta = { transferId: string; file: number; index: number };
type Cancel = { transferId: string };

export interface IncomingOffer extends Offer {
  peerId: string;
  peerName: string;
}

/** Bytes done so far: all files before `fileIndex` are complete. */
export interface TransferProgress {
  fileIndex: number;
  fileBytes: number;
}

export type TransferEnd =
  | { reason: 'cancelled' }
  | { reason: 'cancelled-by-peer' }
  | { reason: 'error'; message: string };

export interface ShareSessionHandlers {
  onPeersChange: (peers: Peer[]) => void;
  /** Ask the user. Resolve with where to write the files, or null to decline. */
  onOffer: (offer: IncomingOffer) => Promise<SinkFactory | null>;
  /** The sender withdrew an offer that's still waiting for an answer. */
  onOfferWithdrawn: (transferId: string) => void;
  onReceiveProgress: (transferId: string, progress: TransferProgress) => void;
  /** `file` is null when it was written straight to disk. */
  onFileReceived: (transferId: string, fileIndex: number, file: File | null) => void;
  onReceiveComplete: (transferId: string) => void;
  onReceiveEnded: (transferId: string, end: TransferEnd) => void;
}

export type SendResult = 'sent' | 'declined' | 'cancelled' | 'cancelled-by-peer';

export interface OutgoingTransfer {
  transferId: string;
  /** Rejects if the transfer fails (e.g. the receiver disconnects). */
  done: Promise<SendResult>;
  cancel: () => void;
}

export interface ShareSession {
  sendFiles: (peerId: string, files: File[], onProgress: (progress: TransferProgress) => void) => OutgoingTransfer;
  cancelReceive: (transferId: string) => void;
  leave: () => Promise<void>;
}

export class ShareError extends Error {
  constructor(readonly code: 'no-public-ip', message: string) {
    super(message);
  }
}

// Trystero hands back the same room instance for the same room ID, so a join
// that overlaps an earlier session's leave (a remount) would be torn down by it.
let pendingLeave: Promise<void> = Promise.resolve();

interface Incoming {
  offer: IncomingOffer;
  sinks: SinkFactory;
  fileIndex: number;
  fileBytes: number;
  sink: FileSink | null;
  order: InOrderBuffer<ArrayBuffer>;
  /** Chunks are handled one at a time so writes land in order. */
  queue: Promise<void>;
  ended: boolean;
}

interface Outgoing {
  peerId: string;
  controller: AbortController;
  /** Set when the transfer stopped for a reason other than our own cancel. */
  stop: SendResult | Error | null;
}

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'The transfer failed.');

/** Join the discovery room shared by every device on this network. */
export async function joinShareSession(selfName: string, handlers: ShareSessionHandlers): Promise<ShareSession> {
  const config = getShareConfig();
  const ip = config.publicIp ?? await discoverPublicIp(config.iceServers);
  if (!ip) {
    throw new ShareError('no-public-ip', "Couldn't reach the internet to look for nearby devices. Check your connection and reload.");
  }

  const [{ joinRoom }, roomId] = await Promise.all([import('trystero'), roomIdForIp(ip)]);
  await pendingLeave;
  const room: Room = joinRoom(
    {
      appId: APP_ID,
      relayConfig: { urls: config.relayUrls, warnOnRelayFailure: false },
      rtcConfig: { iceServers: config.iceServers },
      _test_only_mdnsHostFallbackToLoopback: config.loopbackFallback,
    },
    roomId,
  );

  const peers = new Map<string, string>();
  const emitPeers = () => handlers.onPeersChange([...peers].map(([id, name]) => ({ id, name })));
  const key = (peerId: string, transferId: string) => `${peerId}:${transferId}`;
  const incoming = new Map<string, Incoming>();
  const outgoing = new Map<string, Outgoing>();
  /** Offers on screen waiting for an answer, so the sender can withdraw them. */
  const pendingOffers = new Map<string, () => void>();

  // ── Peers ────────────────────────────────────────────────────────────────

  // Peers whose connection is open; a hello reply that arrives after the peer left is ignored.
  const connected = new Set<string>();
  const addPeer = (peerId: string, name: string) => {
    connected.add(peerId);
    peers.set(peerId, name);
    emitPeers();
  };

  // Both sides say hello on join. A message that lands before the other side
  // has finished admitting this peer is dropped, so a one-way announcement can
  // be lost; the later of the two requests always gets through, and its reply
  // carries the other side's name.
  const hello = room.makeAction<Profile, Profile>('hello', {
    kind: 'request',
    onRequest: ({ name }, { peerId }) => {
      addPeer(peerId, name);
      return { name: selfName };
    },
  });

  room.onPeerJoin = peerId => {
    connected.add(peerId);
    hello.request({ name: selfName }, { target: peerId, timeoutMs: HELLO_TIMEOUT_MS })
      .then(({ name }) => { if (connected.has(peerId)) addPeer(peerId, name); })
      .catch(() => { /* the other side's hello covers it */ });
  };

  room.onPeerLeave = peerId => {
    const message = `${peers.get(peerId) ?? 'The other device'} disconnected before the transfer finished.`;
    connected.delete(peerId);
    peers.delete(peerId);
    emitPeers();
    for (const [k, t] of incoming) {
      if (t.offer.peerId === peerId) void endIncoming(k, { reason: 'error', message });
    }
    for (const [k, withdraw] of pendingOffers) if (k.startsWith(`${peerId}:`)) withdraw();
    for (const t of outgoing.values()) {
      if (t.peerId !== peerId) continue;
      t.stop = new Error(message);
      t.controller.abort();
    }
  };

  // ── Receiving ────────────────────────────────────────────────────────────

  const endIncoming = async (k: string, end: TransferEnd) => {
    const t = incoming.get(k);
    if (!t || t.ended) return;
    t.ended = true;
    incoming.delete(k);
    await t.sink?.abort().catch(() => {});
    handlers.onReceiveEnded(t.offer.transferId, end);
  };

  const finishCurrent = async (t: Incoming) => {
    const file = await t.sink!.close();
    t.sink = null;
    handlers.onFileReceived(t.offer.transferId, t.fileIndex, file);
    t.fileIndex++;
    if (t.fileIndex === t.offer.files.length) {
      incoming.delete(key(t.offer.peerId, t.offer.transferId));
      t.ended = true;
      handlers.onReceiveComplete(t.offer.transferId);
    }
  };

  /** Open the sink for the current file, finishing any empty files on the way. */
  const openCurrent = async (t: Incoming) => {
    while (!t.ended && t.fileIndex < t.offer.files.length) {
      const meta: IncomingFileMeta = t.offer.files[t.fileIndex];
      t.sink = await t.sinks(meta);
      t.fileBytes = 0;
      t.order = new InOrderBuffer();
      if (meta.size > 0) return;
      await finishCurrent(t);
    }
  };

  const handleChunk = async (t: Incoming, meta: ChunkMeta, data: ArrayBuffer) => {
    if (t.ended) return;
    const { name, size } = t.offer.files[t.fileIndex];
    if (meta.file !== t.fileIndex) throw new Error(`Got data for file ${meta.file + 1} while receiving file ${t.fileIndex + 1}.`);
    for (const chunk of t.order.push(meta.index, data)) {
      t.fileBytes += chunk.byteLength;
      if (t.fileBytes > size) throw new Error(`${name} arrived larger than announced.`);
      await t.sink!.write(chunk);
    }
    handlers.onReceiveProgress(t.offer.transferId, { fileIndex: t.fileIndex, fileBytes: t.fileBytes });
    if (t.fileBytes === size) {
      await finishCurrent(t);
      await openCurrent(t);
    }
  };

  const offerAction = room.makeAction<Offer, boolean>('offer', {
    kind: 'request',
    onRequest: async (offer, { peerId }) => {
      const k = key(peerId, offer.transferId);
      const full: IncomingOffer = { ...offer, peerId, peerName: peers.get(peerId) ?? 'Unknown device' };
      let withdrawn = false;
      const answer = await new Promise<SinkFactory | null>(resolve => {
        pendingOffers.set(k, () => {
          withdrawn = true;
          handlers.onOfferWithdrawn(offer.transferId);
          resolve(null);
        });
        handlers.onOffer(full).then(resolve, () => resolve(null));
      });
      pendingOffers.delete(k);
      if (withdrawn || !answer) return false;

      const t: Incoming = {
        offer: full, sinks: answer, fileIndex: 0, fileBytes: 0, sink: null,
        order: new InOrderBuffer(), queue: Promise.resolve(), ended: false,
      };
      incoming.set(k, t);
      t.queue = openCurrent(t).catch(e => endIncoming(k, { reason: 'error', message: errorMessage(e) }));
      return true;
    },
  });

  const chunkAction = room.makeAction<ArrayBuffer>('chunk');
  const cancelAction = room.makeAction<Cancel>('cancel');

  chunkAction.onMessage = (data, { peerId, metadata }) => {
    const meta = metadata as ChunkMeta;
    const k = key(peerId, meta.transferId);
    const t = incoming.get(k);
    if (!t) return;
    t.queue = t.queue
      .then(() => handleChunk(t, meta, data))
      .catch(e => {
        void cancelAction.send({ transferId: meta.transferId }, { target: peerId });
        return endIncoming(k, { reason: 'error', message: errorMessage(e) });
      });
  };

  // ── Cancelling ───────────────────────────────────────────────────────────

  cancelAction.onMessage = ({ transferId }, { peerId }) => {
    const k = key(peerId, transferId);
    pendingOffers.get(k)?.();
    void endIncoming(k, { reason: 'cancelled-by-peer' });
    const out = outgoing.get(transferId);
    if (out?.peerId === peerId && !out.controller.signal.aborted) {
      out.stop = 'cancelled-by-peer';
      out.controller.abort();
    }
  };

  // ── Sending ──────────────────────────────────────────────────────────────

  const sendFiles: ShareSession['sendFiles'] = (peerId, files, onProgress) => {
    const transferId = generateId();
    const t: Outgoing = { peerId, controller: new AbortController(), stop: null };
    const { signal } = t.controller;
    outgoing.set(transferId, t);

    const run = async (): Promise<SendResult> => {
      const accepted = await offerAction.request(
        { transferId, files: files.map(f => ({ name: f.name, size: f.size, type: f.type })) },
        { target: peerId, timeoutMs: OFFER_TIMEOUT_MS, signal },
      );
      if (!accepted) return 'declined';
      for (const [fileIndex, file] of files.entries()) {
        let fileBytes = 0;
        onProgress({ fileIndex, fileBytes });
        // Each send waits for the data channel's buffer to drain below Trystero's
        // threshold, so awaiting them in turn is the backpressure
        for await (const { index, data } of readChunks(file)) {
          signal.throwIfAborted();
          await chunkAction.send(data, { target: peerId, metadata: { transferId, file: fileIndex, index }, signal });
          fileBytes += data.byteLength;
          onProgress({ fileIndex, fileBytes });
        }
      }
      return 'sent';
    };

    const done = run()
      .catch((e): SendResult => {
        if (t.stop instanceof Error) throw t.stop;
        if (t.stop) return t.stop;
        if (signal.aborted) return 'cancelled';
        throw e;
      })
      .finally(() => outgoing.delete(transferId));

    return {
      transferId,
      done,
      cancel: () => {
        if (signal.aborted) return;
        void cancelAction.send({ transferId }, { target: peerId });
        t.controller.abort();
      },
    };
  };

  return {
    sendFiles,
    cancelReceive(transferId) {
      for (const [k, t] of incoming) {
        if (t.offer.transferId !== transferId) continue;
        void cancelAction.send({ transferId }, { target: t.offer.peerId });
        void endIncoming(k, { reason: 'cancelled' });
      }
    },
    leave() {
      pendingLeave = room.leave();
      return pendingLeave;
    },
  };
}
