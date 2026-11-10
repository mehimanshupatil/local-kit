// Tiny in-memory Nostr relay (NIP-01 subset) so Share specs never touch public
// relays. Accepts every event without checking signatures, keeps no history
// (Trystero only publishes ephemeral kinds and subscribes with `since: now`),
// and fans each event out to every matching subscription.
import { WebSocketServer } from 'ws';

const port = Number(process.env.NOSTR_RELAY_PORT ?? 7447);
const wss = new WebSocketServer({ port });

/** @type {Map<import('ws').WebSocket, Map<string, object[]>>} */
const subscriptions = new Map();

const matches = (filter, event) => {
  if (filter.ids && !filter.ids.includes(event.id)) return false;
  if (filter.authors && !filter.authors.includes(event.pubkey)) return false;
  if (filter.kinds && !filter.kinds.includes(event.kind)) return false;
  if (filter.since !== undefined && event.created_at < filter.since) return false;
  if (filter.until !== undefined && event.created_at > filter.until) return false;
  for (const [key, values] of Object.entries(filter)) {
    if (!key.startsWith('#')) continue;
    const name = key.slice(1);
    if (!event.tags.some(([t, v]) => t === name && values.includes(v))) return false;
  }
  return true;
};

wss.on('connection', socket => {
  const subs = new Map();
  subscriptions.set(socket, subs);
  socket.on('close', () => subscriptions.delete(socket));

  socket.on('message', raw => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return socket.send(JSON.stringify(['NOTICE', 'invalid: not JSON']));
    }
    const [type, ...rest] = msg;

    if (type === 'EVENT') {
      const [event] = rest;
      socket.send(JSON.stringify(['OK', event.id, true, '']));
      for (const [peer, peerSubs] of subscriptions) {
        for (const [subId, filters] of peerSubs) {
          if (filters.some(f => matches(f, event))) peer.send(JSON.stringify(['EVENT', subId, event]));
        }
      }
    } else if (type === 'REQ') {
      const [subId, ...filters] = rest;
      subs.set(subId, filters);
      socket.send(JSON.stringify(['EOSE', subId]));
    } else if (type === 'CLOSE') {
      const [subId] = rest;
      subs.delete(subId);
      socket.send(JSON.stringify(['CLOSED', subId, '']));
    }
  });
});

wss.on('listening', () => console.log(`nostr relay listening on ws://localhost:${port}`));
const stop = () => wss.close(() => process.exit(0));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
