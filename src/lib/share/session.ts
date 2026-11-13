import type { JoinRoomConfig, Room, RoomError } from 'trystero';
import { generateId } from '@/lib/utils/fileUtils';
import { readChunks } from './chunking';
import { readProfile, type DeviceInfo, type Profile } from './device';
import {
  PAIRING_TTL_MS, fingerprintFromSdp, generateCode, generateSecret, pairingLink, pairingRoom, safetyEmojis,
  type PairingKey,
} from './pairing';
import { discoverPublicIp, roomIdForIp } from './room';
import { getShareConfig } from './servers';
import type { FileSink, IncomingFileMeta, SinkFactory } from './sinks';
import { MAX_TEXT_LENGTH } from './text';
import { InOrderBuffer } from './transfer';

/** Each Share tool finds only devices on the same tool: Send never lists a device that's on Call. */
export type ShareApp = 'send' | 'call';
const APP_IDS: Record<ShareApp, string> = { send: 'localkit-share', call: 'localkit-call' };
/** How long a sender waits for the receiver to tap Accept or Decline. */
const OFFER_TIMEOUT_MS = 5 * 60_000;
const HELLO_TIMEOUT_MS = 10_000;
/** How long someone entering a code waits for the device showing it. */
const PAIRING_JOIN_TIMEOUT_MS = 30_000;
/** Room errors that mean a pairing attempt can't connect. */
const PAIRING_FAILURES = new Set<RoomError['code']>(['room-full', 'peer-connect-failed', 'handshake-failed', 'decrypt-failed']);

/** How this device reached a peer: discovered on the same network, or paired with a code or link. */
export type PeerVia = 'nearby' | 'paired';

export interface Peer {
  id: string;
  name: string;
  device: DeviceInfo;
  via: PeerVia;
}

type FileMeta = { name: string; size: number; type: string };
type Offer = { transferId: string; files: FileMeta[] };
type ChunkMeta = { transferId: string; file: number; index: number };
type Cancel = { transferId: string };
type TextOffer = { transferId: string; length: number };
type TextMessage = { transferId: string; text: string };
type CallOffer = { callId: string };
export type CallState = { callId: string; muted: boolean; cameraOff: boolean; sharing: boolean };
type CallEnd = { callId: string };

export interface IncomingOffer extends Offer {
  peerId: string;
  peerName: string;
}

export interface IncomingTextOffer extends TextOffer {
  peerId: string;
  peerName: string;
}

export interface IncomingCall {
  callId: string;
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

export interface PairingInvite {
  code: string;
  link: string;
  expiresAt: number;
}

/** Why a pairing attempt ended without connecting. */
export type PairingEnd =
  /** Nobody used the code or link before it expired. */
  | 'expired'
  /** No device was showing the code that was entered. */
  | 'not-found'
  /** The device was found but the connection failed (or it was already paired). */
  | 'failed';

/** Connection-level events every Share tool handles. */
export interface ShareSessionBaseHandlers {
  onPeersChange: (peers: Peer[]) => void;
  /** A device on this network was found but a direct connection to it couldn't be made (no TURN relay). */
  onConnectionFailed: () => void;
  /** Paired with a device; show both people the safety emojis to compare. */
  onPaired: (peer: Peer, emojis: string[]) => void;
  onPairingEnded: (reason: PairingEnd) => void;
}

/** Events for what a tool does over the connection; a tool leaves out what it doesn't do, and those offers are declined. */
export interface ShareToolHandlers {
  /** Ask the user. Resolve with where to write the files, or null to decline. */
  onOffer?: (offer: IncomingOffer) => Promise<SinkFactory | null>;
  /** Ask the user whether to accept a text message; resolve true to accept. */
  onTextOffer?: (offer: IncomingTextOffer) => Promise<boolean>;
  /** Text from an offer this side accepted. */
  onText?: (transferId: string, text: string) => void;
  /** Ask the user. Resolve with this side's camera and microphone to answer, or null to decline. */
  onCall?: (call: IncomingCall) => Promise<MediaStream | null>;
  /** The other side's camera and microphone, once a call connects. */
  onRemoteStream?: (callId: string, stream: MediaStream) => void;
  /** The other side muted, unmuted, or turned their camera off or on. */
  onCallState?: (state: CallState) => void;
  onCallEnded?: (callId: string, reason: 'hung-up' | 'disconnected') => void;
  /** The sender withdrew an offer (files, text or a call) that's still waiting for an answer. */
  onOfferWithdrawn?: (id: string) => void;
  onReceiveProgress?: (transferId: string, progress: TransferProgress) => void;
  /** `file` is null when it was written straight to disk. */
  onFileReceived?: (transferId: string, fileIndex: number, file: File | null) => void;
  onReceiveComplete?: (transferId: string) => void;
  onReceiveEnded?: (transferId: string, end: TransferEnd) => void;
}

export type ShareSessionHandlers = ShareSessionBaseHandlers & ShareToolHandlers;

export type SendResult = 'sent' | 'declined' | 'cancelled' | 'cancelled-by-peer';

export interface OutgoingTransfer {
  transferId: string;
  /** Rejects if the transfer fails (e.g. the receiver disconnects). */
  done: Promise<SendResult>;
  cancel: () => void;
}

export type CallResult = 'accepted' | 'declined' | 'cancelled';

export interface OutgoingCall {
  callId: string;
  /** Rejects if the call fails (e.g. the other device disconnects). */
  answered: Promise<CallResult>;
  cancel: () => void;
}

export interface ShareSession {
  /** Join or leave the room shared by every device on this network. */
  setNearby: (on: boolean) => Promise<void>;
  /** Show a code and link another device can use to pair, from any network. */
  startPairing: (pageUrl: string) => Promise<PairingInvite>;
  /** Pair using a code or link from another device. */
  joinPairing: (key: PairingKey) => Promise<void>;
  /** Stop a pairing attempt that hasn't connected yet. */
  cancelPairing: () => void;
  /** Disconnect a paired device (e.g. the safety emojis didn't match). */
  unpair: (peerId: string) => void;
  /** Change this device's name; connected devices see it straight away. */
  updateProfile: (profile: Profile) => void;
  sendFiles: (peerId: string, files: File[], onProgress: (progress: TransferProgress) => void) => OutgoingTransfer;
  sendText: (peerId: string, text: string) => OutgoingTransfer;
  cancelReceive: (transferId: string) => void;
  /** Ring a device; once it answers, `stream` is sent to it. */
  call: (peerId: string, stream: MediaStream) => OutgoingCall;
  /** Tell the other side about muting, turning the camera off, or sharing the screen. */
  setCallState: (state: CallState) => void;
  /** Send `next` in place of `previous` (switching camera, sharing the screen) without reconnecting. */
  replaceVideoTrack: (callId: string, previous: MediaStreamTrack, next: MediaStreamTrack) => Promise<void>;
  /** The call's connection statistics, for the quality indicator. */
  getCallStats: (callId: string) => Promise<RTCStatsReport | null>;
  hangUp: (callId: string) => void;
  leave: () => Promise<void>;
}

export class ShareError extends Error {
  constructor(readonly code: 'no-public-ip', message: string) {
    super(message);
  }
}

// Trystero won't join a room that's still being left, so a join that overlaps
// an earlier leave of that room (a remount) waits for the leave to finish.
const pendingLeaves = new Map<string, Promise<void>>();

function makeActions(room: Room) {
  return {
    hello: room.makeAction<Profile, Profile>('hello', { kind: 'request' }),
    profile: room.makeAction<Profile>('profile'),
    offer: room.makeAction<Offer, boolean>('offer', { kind: 'request' }),
    chunk: room.makeAction<ArrayBuffer>('chunk'),
    cancel: room.makeAction<Cancel>('cancel'),
    textOffer: room.makeAction<TextOffer, boolean>('text-offer', { kind: 'request' }),
    text: room.makeAction<TextMessage>('text'),
    callOffer: room.makeAction<CallOffer, boolean>('call-offer', { kind: 'request' }),
    callState: room.makeAction<CallState>('call-state'),
    callEnd: room.makeAction<CallEnd>('call-end'),
  };
}

type Actions = ReturnType<typeof makeActions>;

/** One Trystero room and the actions that run over it. */
interface Channel extends Actions {
  kind: 'nearby' | 'pairing';
  roomId: string;
  room: Room;
  /** Peers whose connection in this room is open. */
  members: Set<string>;
}

interface Pairing {
  channels: Channel[];
  timer: ReturnType<typeof setTimeout>;
  /** The one device allowed in; set as soon as it connects, which locks the rooms. */
  peerId: string | null;
}

interface Incoming {
  channel: Channel;
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

interface Call {
  channel: Channel;
  peerId: string;
  stream: MediaStream;
}

interface Outgoing {
  channel: Channel;
  peerId: string;
  controller: AbortController;
  /** Set when the transfer stopped for a reason other than our own cancel. */
  stop: SendResult | Error | null;
}

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'The transfer failed.');

/** For best-effort messages: a send to a peer that has just gone rejects, and there's nothing to do about it. */
const quietly = (p: Promise<unknown>) => void p.catch(() => {});

export async function createShareSession(
  initialProfile: Profile,
  handlers: ShareSessionHandlers,
  { app = 'send' }: { app?: ShareApp } = {},
): Promise<ShareSession> {
  let self = initialProfile;
  const appId = APP_IDS[app];
  const config = getShareConfig();
  const { joinRoom } = await import('trystero');

  const channels = new Set<Channel>();
  let nearby: Channel | null = null;
  let pairing: Pairing | null = null;
  /** Paired peers whose safety emojis have been sent to the UI. */
  const announcedPairs = new Set<string>();

  const peers = new Map<string, Profile>();
  const key = (peerId: string, transferId: string) => `${peerId}:${transferId}`;
  const incoming = new Map<string, Incoming>();
  const outgoing = new Map<string, Outgoing>();
  /** Offers on screen waiting for an answer, so the sender can withdraw them. */
  const pendingOffers = new Map<string, () => void>();
  /** Text offers this side accepted and is waiting to receive. */
  const acceptedTexts = new Set<string>();
  /** Calls that have been answered, by call ID. */
  const calls = new Map<string, Call>();

  const channelsOf = (peerId: string) => [...channels].filter(c => c.members.has(peerId));
  /** The room to reach a peer through, preferring a paired one. */
  const channelOf = (peerId: string) => {
    const options = channelsOf(peerId);
    return options.find(c => c.kind === 'pairing') ?? options[0] ?? null;
  };
  const peerName = (peerId: string) => peers.get(peerId)?.name ?? 'Unknown device';

  const toPeer = (id: string): Peer => {
    const { name, device } = peers.get(id)!;
    return { id, name, device, via: channelsOf(id).some(c => c.kind === 'pairing') ? 'paired' : 'nearby' };
  };
  const emitPeers = () => handlers.onPeersChange([...peers.keys()].filter(id => channelOf(id)).map(toPeer));

  // ── Rooms ────────────────────────────────────────────────────────────────

  const roomConfig = (kind: Channel['kind'], password?: string): JoinRoomConfig => ({
    appId,
    password,
    // A fresh key each visit: the default keeps one in IndexedDB, which every
    // device on the network could use to recognise this one across visits
    identity: 'none',
    // A pairing room admits this device and exactly one other
    maxUsers: kind === 'pairing' ? 2 : undefined,
    relayConfig: { urls: config.relayUrls, warnOnRelayFailure: false },
    rtcConfig: { iceServers: config.iceServers, iceTransportPolicy: config.iceTransportPolicy },
  });

  const open = async (
    kind: Channel['kind'],
    roomId: string,
    password: string | undefined,
    onError: (error: RoomError) => void,
  ): Promise<Channel> => {
    await pendingLeaves.get(`${appId}:${roomId}`);
    const room = joinRoom(roomConfig(kind, password), roomId);
    room.onError(onError);
    const actions = makeActions(room);
    const channel: Channel = { kind, roomId, room, members: new Set(), ...actions };
    channels.add(channel);
    wire(channel);
    return channel;
  };

  const close = (channel: Channel) => {
    if (!channels.delete(channel)) return;
    for (const peerId of [...channel.members]) peerLeft(channel, peerId);
    const leaveKey = `${appId}:${channel.roomId}`;
    const leaving = channel.room.leave();
    pendingLeaves.set(leaveKey, leaving);
    void leaving.finally(() => { if (pendingLeaves.get(leaveKey) === leaving) pendingLeaves.delete(leaveKey); });
  };

  // ── Peers ────────────────────────────────────────────────────────────────

  const addPeer = (channel: Channel, peerId: string, profile: unknown) => {
    if (!channel.members.has(peerId)) return;
    peers.set(peerId, readProfile(profile));
    emitPeers();
    if (channel.kind === 'pairing' && !announcedPairs.has(peerId)) {
      announcedPairs.add(peerId);
      void announcePair(channel, peerId);
    }
  };

  /** Work out the safety emojis from both ends' DTLS certificates. */
  const announcePair = async (channel: Channel, peerId: string) => {
    const pc = channel.room.getPeers()[peerId]?.connection;
    const local = fingerprintFromSdp(pc?.localDescription?.sdp);
    const remote = fingerprintFromSdp(pc?.remoteDescription?.sdp);
    const emojis = local && remote ? await safetyEmojis(local, remote) : [];
    if (channel.members.has(peerId)) handlers.onPaired(toPeer(peerId), emojis);
  };

  /** A peer's connection in one room closed; it's gone once it's in no room at all. */
  const peerLeft = (channel: Channel, peerId: string) => {
    if (!channel.members.delete(peerId)) return;
    const message = `${peerName(peerId)} disconnected before the transfer finished.`;
    for (const [k, t] of incoming) {
      if (t.offer.peerId === peerId && t.channel === channel) void endIncoming(k, { reason: 'error', message });
    }
    for (const t of outgoing.values()) {
      if (t.peerId !== peerId || t.channel !== channel) continue;
      t.stop = new Error(message);
      t.controller.abort();
    }
    for (const [callId, call] of calls) {
      if (call.peerId === peerId && call.channel === channel) endCall(callId, 'disconnected');
    }
    if (!channelOf(peerId)) {
      for (const [k, withdraw] of pendingOffers) if (k.startsWith(`${peerId}:`)) withdraw();
      peers.delete(peerId);
      announcedPairs.delete(peerId);
    }
    // A pairing room is for one device; once it's gone, so is the room
    if (channel.kind === 'pairing' && channel.members.size === 0) close(channel);
    emitPeers();
  };

  // ── Receiving ────────────────────────────────────────────────────────────

  const endIncoming = async (k: string, end: TransferEnd) => {
    const t = incoming.get(k);
    if (!t || t.ended) return;
    t.ended = true;
    incoming.delete(k);
    await t.sink?.abort().catch(() => {});
    handlers.onReceiveEnded?.(t.offer.transferId, end);
  };

  const finishCurrent = async (t: Incoming) => {
    const file = await t.sink!.close();
    t.sink = null;
    handlers.onFileReceived?.(t.offer.transferId, t.fileIndex, file);
    t.fileIndex++;
    if (t.fileIndex === t.offer.files.length) {
      incoming.delete(key(t.offer.peerId, t.offer.transferId));
      t.ended = true;
      handlers.onReceiveComplete?.(t.offer.transferId);
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
    handlers.onReceiveProgress?.(t.offer.transferId, { fileIndex: t.fileIndex, fileBytes: t.fileBytes });
    if (t.fileBytes === size) {
      await finishCurrent(t);
      await openCurrent(t);
    }
  };

  /** Put an offer to the user; resolves null if they decline or the sender withdraws it first. */
  const ask = async <T>(peerId: string, transferId: string, question: () => Promise<T | null>): Promise<T | null> => {
    const k = key(peerId, transferId);
    let withdrawn = false;
    const answer = await new Promise<T | null>(resolve => {
      pendingOffers.set(k, () => {
        withdrawn = true;
        handlers.onOfferWithdrawn?.(transferId);
        resolve(null);
      });
      question().then(resolve, () => resolve(null));
    });
    pendingOffers.delete(k);
    return withdrawn ? null : answer;
  };

  /** Hook a room's actions up to the shared transfer logic. */
  const wire = (channel: Channel) => {
    const { room, hello } = channel;

    // Both sides say hello on join. A message that lands before the other side
    // has finished admitting this peer is dropped, so a one-way announcement can
    // be lost; the later of the two requests always gets through, and its reply
    // carries the other side's name.
    hello.onRequest((profile, { peerId }) => {
      channel.members.add(peerId);
      addPeer(channel, peerId, profile);
      return self;
    });

    // Renames after connecting
    channel.profile.onMessage((profile, { peerId }) => addPeer(channel, peerId, profile));

    room.onPeerJoin(({ peerId }) => {
      channel.members.add(peerId);
      hello.request(self, { target: peerId, timeoutMs: HELLO_TIMEOUT_MS })
        .then(profile => addPeer(channel, peerId, profile))
        .catch(() => { /* the other side's hello covers it */ });
    });
    room.onPeerLeave(({ peerId }) => peerLeft(channel, peerId));

    channel.offer.onRequest(async (offer, { peerId }) => {
      const k = key(peerId, offer.transferId);
      const full: IncomingOffer = { ...offer, peerId, peerName: peerName(peerId) };
      const answer = await ask(peerId, offer.transferId, async () => (await handlers.onOffer?.(full)) ?? null);
      if (!answer) return false;

      const t: Incoming = {
        channel, offer: full, sinks: answer, fileIndex: 0, fileBytes: 0, sink: null,
        order: new InOrderBuffer(), queue: Promise.resolve(), ended: false,
      };
      incoming.set(k, t);
      t.queue = openCurrent(t).catch(e => endIncoming(k, { reason: 'error', message: errorMessage(e) }));
      return true;
    });

    channel.chunk.onMessage((data, { peerId, metadata }) => {
      const meta = metadata as ChunkMeta;
      const k = key(peerId, meta.transferId);
      const t = incoming.get(k);
      if (!t) return;
      t.queue = t.queue
        .then(() => handleChunk(t, meta, data))
        .catch(e => {
          quietly(channel.cancel.send({ transferId: meta.transferId }, { target: peerId }));
          return endIncoming(k, { reason: 'error', message: errorMessage(e) });
        });
    });

    channel.textOffer.onRequest(async (offer, { peerId }) => {
      if (!(offer.length > 0 && offer.length <= MAX_TEXT_LENGTH)) return false;
      const full: IncomingTextOffer = { ...offer, peerId, peerName: peerName(peerId) };
      const accepted = await ask(peerId, offer.transferId, async () => (await handlers.onTextOffer?.(full)) || null);
      if (accepted) acceptedTexts.add(key(peerId, offer.transferId));
      return Boolean(accepted);
    });

    channel.text.onMessage(({ transferId, text }, { peerId }) => {
      // Only text the user agreed to see, and no more than was offered
      if (!acceptedTexts.delete(key(peerId, transferId)) || typeof text !== 'string' || text.length > MAX_TEXT_LENGTH) return;
      handlers.onText?.(transferId, text);
    });

    channel.callOffer.onRequest(async ({ callId }, { peerId }) => {
      // One call at a time
      if (calls.size > 0 || typeof callId !== 'string') return false;
      const stream = await ask(peerId, callId, async () => (await handlers.onCall?.({ callId, peerId, peerName: peerName(peerId) })) ?? null);
      if (!stream) return false;
      if (!channel.members.has(peerId)) {
        stopTracks(stream);
        return false;
      }
      calls.set(callId, { channel, peerId, stream });
      quietly(room.addStream(stream, { target: peerId, metadata: { callId } }));
      return true;
    });

    room.onPeerStream((stream, { peerId, metadata }) => {
      const callId = (metadata as { callId?: unknown } | undefined)?.callId;
      if (typeof callId === 'string' && calls.get(callId)?.peerId === peerId) handlers.onRemoteStream?.(callId, stream);
    });

    channel.callState.onMessage((state, { peerId }) => {
      if (calls.get(state.callId)?.peerId === peerId) handlers.onCallState?.(state);
    });

    channel.callEnd.onMessage(({ callId }, { peerId }) => {
      if (calls.get(callId)?.peerId === peerId) endCall(callId, 'hung-up');
    });

    channel.cancel.onMessage(({ transferId }, { peerId }) => {
      const k = key(peerId, transferId);
      pendingOffers.get(k)?.();
      void endIncoming(k, { reason: 'cancelled-by-peer' });
      const out = outgoing.get(transferId);
      if (out?.peerId === peerId && !out.controller.signal.aborted) {
        out.stop = 'cancelled-by-peer';
        out.controller.abort();
      }
    });
  };

  // ── Calls ────────────────────────────────────────────────────────────────

  const stopTracks = (stream: MediaStream) => { for (const track of stream.getTracks()) track.stop(); };

  /** Stop sending to the other side and forget the call. The UI owns (and stops) its own camera. */
  const endCall = (callId: string, reason: 'hung-up' | 'disconnected' | null) => {
    const call = calls.get(callId);
    if (!call) return;
    calls.delete(callId);
    try {
      call.channel.room.removeStream(call.stream, { target: call.peerId });
    } catch {
      // The connection is already gone
    }
    if (reason) handlers.onCallEnded?.(callId, reason);
  };

  const call: ShareSession['call'] = (peerId, stream) => {
    const callId = generateId();
    const channel = route(peerId);
    const controller = new AbortController();
    const { signal } = controller;
    const run = async (): Promise<CallResult> => {
      const accepted = await channel.callOffer.request({ callId }, { target: peerId, timeoutMs: OFFER_TIMEOUT_MS, signal });
      if (!accepted) return 'declined';
      signal.throwIfAborted();
      calls.set(callId, { channel, peerId, stream });
      await channel.room.addStream(stream, { target: peerId, metadata: { callId } });
      return 'accepted';
    };
    return {
      callId,
      answered: run().catch((e): CallResult => {
        if (signal.aborted) return 'cancelled';
        throw e;
      }),
      cancel: () => {
        if (signal.aborted) return;
        quietly(channel.cancel.send({ transferId: callId }, { target: peerId }));
        controller.abort();
      },
    };
  };

  // ── Nearby ───────────────────────────────────────────────────────────────

  const setNearby: ShareSession['setNearby'] = async on => {
    if (!on) {
      if (nearby) close(nearby);
      nearby = null;
      return;
    }
    if (nearby) return;
    const ip = config.publicIp ?? await discoverPublicIp(config.iceServers);
    if (!ip) {
      throw new ShareError('no-public-ip', "Couldn't reach the internet to look for nearby devices. Check your connection and reload.");
    }
    nearby = await open('nearby', await roomIdForIp(ip), undefined, error => {
      if (error.code === 'peer-connect-failed') handlers.onConnectionFailed();
    });
  };

  // ── Pairing ──────────────────────────────────────────────────────────────

  const endPairing = (reason: PairingEnd | null) => {
    const p = pairing;
    if (!p) return;
    pairing = null;
    clearTimeout(p.timer);
    for (const c of p.channels) if (c.members.size === 0) close(c);
    if (reason) handlers.onPairingEnded(reason);
  };

  /** Join a private pairing room that admits exactly one other device. */
  const openPairingRoom = async (p: Pairing, pairingKey: PairingKey) => {
    const { roomId, password } = await pairingRoom(pairingKey);
    const channel = await open('pairing', roomId, password, error => {
      // Turned away because the room already has its two devices, or a guest's connection failing
      if (PAIRING_FAILURES.has(error.code) && pairing === p && !p.peerId) endPairing('failed');
    });
    p.channels.push(channel);
    // Runs after wire()'s join listener, which has already admitted the peer
    channel.room.onPeerJoin(({ peerId }) => {
      if (pairing !== p) return;
      p.peerId = peerId;
      // Paired: the other code or link is no longer needed
      for (const other of p.channels) if (other !== channel) close(other);
      p.channels = [channel];
      endPairing(null);
    });
    return channel;
  };

  const startPairing: ShareSession['startPairing'] = async pageUrl => {
    endPairing(null);
    const ttl = config.pairingTtlMs ?? PAIRING_TTL_MS;
    const p: Pairing = { channels: [], peerId: null, timer: setTimeout(() => { if (pairing === p) endPairing('expired'); }, ttl) };
    pairing = p;
    const code = generateCode();
    const secret = generateSecret();
    await Promise.all([openPairingRoom(p, { kind: 'code', code }), openPairingRoom(p, { kind: 'link', secret })]);
    if (pairing !== p) for (const c of p.channels) if (c.members.size === 0) close(c);
    return { code, link: pairingLink(pageUrl, secret), expiresAt: Date.now() + ttl };
  };

  const joinPairing: ShareSession['joinPairing'] = async pairingKey => {
    endPairing(null);
    const timeout = config.pairingJoinTimeoutMs ?? PAIRING_JOIN_TIMEOUT_MS;
    const p: Pairing = { channels: [], peerId: null, timer: setTimeout(() => { if (pairing === p) endPairing('not-found'); }, timeout) };
    pairing = p;
    await openPairingRoom(p, pairingKey);
    if (pairing !== p) for (const c of p.channels) if (c.members.size === 0) close(c);
  };

  // ── Sending ──────────────────────────────────────────────────────────────

  const route = (peerId: string) => {
    const channel = channelOf(peerId);
    if (!channel) throw new Error(`${peerName(peerId)} is no longer connected.`);
    return channel;
  };

  const sendFiles: ShareSession['sendFiles'] = (peerId, files, onProgress) => {
    const transferId = generateId();
    const channel = route(peerId);
    const t: Outgoing = { channel, peerId, controller: new AbortController(), stop: null };
    const { signal } = t.controller;
    outgoing.set(transferId, t);

    const run = async (): Promise<SendResult> => {
      const accepted = await channel.offer.request(
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
          await channel.chunk.send(data, { target: peerId, metadata: { transferId, file: fileIndex, index }, signal });
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
        quietly(channel.cancel.send({ transferId }, { target: peerId }));
        t.controller.abort();
      },
    };
  };

  const sendText: ShareSession['sendText'] = (peerId, text) => {
    const transferId = generateId();
    const channel = route(peerId);
    const controller = new AbortController();
    const { signal } = controller;
    const run = async (): Promise<SendResult> => {
      const accepted = await channel.textOffer.request(
        { transferId, length: text.length },
        { target: peerId, timeoutMs: OFFER_TIMEOUT_MS, signal },
      );
      if (!accepted) return 'declined';
      await channel.text.send({ transferId, text }, { target: peerId, signal });
      return 'sent';
    };
    return {
      transferId,
      done: run().catch((e): SendResult => {
        if (signal.aborted) return 'cancelled';
        throw e;
      }),
      cancel: () => {
        if (signal.aborted) return;
        quietly(channel.cancel.send({ transferId }, { target: peerId }));
        controller.abort();
      },
    };
  };

  return {
    setNearby,
    startPairing,
    joinPairing,
    cancelPairing: () => endPairing(null),
    unpair(peerId) {
      for (const c of channelsOf(peerId)) if (c.kind === 'pairing') close(c);
    },
    updateProfile(profile) {
      self = profile;
      for (const c of channels) quietly(c.profile.send(profile));
    },
    sendFiles,
    sendText,
    call,
    setCallState(state) {
      const c = calls.get(state.callId);
      if (c) quietly(c.channel.callState.send(state, { target: c.peerId }));
    },
    async replaceVideoTrack(callId, previous, next) {
      const c = calls.get(callId);
      if (!c) return;
      await c.channel.room.replaceTrack(previous, next, { target: c.peerId });
      // Keep the call's stream in step, so the next swap and hanging up find the right track
      c.stream.removeTrack(previous);
      c.stream.addTrack(next);
    },
    async getCallStats(callId) {
      const c = calls.get(callId);
      const pc = c ? c.channel.room.getPeers()[c.peerId]?.connection : undefined;
      return pc ? pc.getStats() : null;
    },
    hangUp(callId) {
      const c = calls.get(callId);
      if (c) quietly(c.channel.callEnd.send({ callId }, { target: c.peerId }));
      endCall(callId, null);
    },
    cancelReceive(transferId) {
      for (const [k, t] of incoming) {
        if (t.offer.transferId !== transferId) continue;
        quietly(t.channel.cancel.send({ transferId }, { target: t.offer.peerId }));
        void endIncoming(k, { reason: 'cancelled' });
      }
    },
    async leave() {
      endPairing(null);
      for (const callId of [...calls.keys()]) {
        const c = calls.get(callId)!;
        quietly(c.channel.callEnd.send({ callId }, { target: c.peerId }));
        endCall(callId, null);
      }
      const leaving = [...channels].map(c => {
        close(c);
        return pendingLeaves.get(`${appId}:${c.roomId}`);
      });
      await Promise.all(leaving);
    },
  };
}
