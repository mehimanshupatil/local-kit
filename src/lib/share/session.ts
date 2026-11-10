import type { Room } from 'trystero';
import { generateId } from '@/lib/utils/fileUtils';
import { Reassembler, readChunks } from './chunking';
import { discoverPublicIp, roomIdForIp } from './room';
import { getShareConfig } from './servers';

const APP_ID = 'localkit-share';
/** How long a sender waits for the receiver to tap Accept or Decline. */
const OFFER_TIMEOUT_MS = 5 * 60_000;
const HELLO_TIMEOUT_MS = 10_000;

export interface Peer {
  id: string;
  name: string;
}

type Profile = { name: string };
type Offer = { transferId: string; name: string; size: number; type: string };
type ChunkMeta = { transferId: string; index: number };

export interface IncomingOffer extends Offer {
  peerId: string;
  peerName: string;
}

export interface ShareSessionHandlers {
  onPeersChange: (peers: Peer[]) => void;
  /** Ask the user; resolve true to accept the file. */
  onOffer: (offer: IncomingOffer) => Promise<boolean>;
  onReceiveProgress: (transferId: string, received: number, total: number) => void;
  onReceived: (transferId: string, file: File) => void;
  onReceiveError: (transferId: string, message: string) => void;
}

export type SendResult = 'sent' | 'declined';

export interface ShareSession {
  sendFile: (peerId: string, file: File, onProgress: (sent: number, total: number) => void) => Promise<SendResult>;
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

interface IncomingTransfer {
  offer: IncomingOffer;
  assembler: Reassembler;
}

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
  const incoming = new Map<string, IncomingTransfer>();
  const emitPeers = () => handlers.onPeersChange([...peers].map(([id, name]) => ({ id, name })));
  const incomingKey = (peerId: string, transferId: string) => `${peerId}:${transferId}`;

  const finishIncoming = (key: string, transfer: IncomingTransfer) => {
    incoming.delete(key);
    const { offer, assembler } = transfer;
    handlers.onReceived(offer.transferId, new File([assembler.toBlob(offer.type)], offer.name, { type: offer.type }));
  };

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
    connected.delete(peerId);
    peers.delete(peerId);
    emitPeers();
    for (const [key, transfer] of incoming) {
      if (transfer.offer.peerId !== peerId) continue;
      incoming.delete(key);
      handlers.onReceiveError(transfer.offer.transferId, `${transfer.offer.peerName} disconnected before the file finished.`);
    }
  };

  const offerAction = room.makeAction<Offer, boolean>('offer', {
    kind: 'request',
    onRequest: async (offer, { peerId }) => {
      const full: IncomingOffer = { ...offer, peerId, peerName: peers.get(peerId) ?? 'Unknown device' };
      const accepted = await handlers.onOffer(full);
      if (!accepted) return false;
      const key = incomingKey(peerId, offer.transferId);
      const transfer = { offer: full, assembler: new Reassembler(offer.size) };
      incoming.set(key, transfer);
      // An empty file has no chunks to wait for.
      if (transfer.assembler.complete) queueMicrotask(() => finishIncoming(key, transfer));
      return true;
    },
  });

  const chunkAction = room.makeAction<ArrayBuffer>('chunk');
  chunkAction.onMessage = (data, { peerId, metadata }) => {
    const { transferId, index } = metadata as ChunkMeta;
    const key = incomingKey(peerId, transferId);
    const transfer = incoming.get(key);
    if (!transfer) return;
    try {
      transfer.assembler.add(index, data);
    } catch (e) {
      incoming.delete(key);
      handlers.onReceiveError(transferId, e instanceof Error ? e.message : 'The file arrived corrupted.');
      return;
    }
    handlers.onReceiveProgress(transferId, transfer.assembler.received, transfer.offer.size);
    if (transfer.assembler.complete) finishIncoming(key, transfer);
  };

  return {
    async sendFile(peerId, file, onProgress) {
      const transferId = generateId();
      const accepted = await offerAction.request(
        { transferId, name: file.name, size: file.size, type: file.type },
        { target: peerId, timeoutMs: OFFER_TIMEOUT_MS },
      );
      if (!accepted) return 'declined';

      let sent = 0;
      onProgress(0, file.size);
      for await (const { index, data } of readChunks(file)) {
        await chunkAction.send(data, { target: peerId, metadata: { transferId, index } });
        sent += data.byteLength;
        onProgress(sent, file.size);
      }
      return 'sent';
    },
    leave() {
      pendingLeave = room.leave();
      return pendingLeave;
    },
  };
}
