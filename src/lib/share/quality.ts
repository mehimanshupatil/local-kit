export type QualityLevel = 'good' | 'fair' | 'poor';

export interface CallQuality {
  level: QualityLevel;
  /** Round trip in milliseconds, if known. */
  rttMs: number | null;
  /** Share of incoming packets lost since the previous sample, 0–100. */
  lossPct: number;
}

/** Counters carried between samples, so loss is measured over the last interval, not the whole call. */
export interface PacketCounters {
  received: number;
  lost: number;
}

type Stat = Record<string, unknown> & { type?: string };

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Read round trip and packet loss out of an RTCStatsReport's values.
 * Round trip comes from the active candidate pair; loss from incoming audio and video.
 */
export function readStats(stats: Iterable<Stat>, previous: PacketCounters | null): { rttMs: number | null; lossPct: number; counters: PacketCounters } {
  const all = [...stats];
  const transport = all.find(s => s.type === 'transport');
  const pair = all.find(s => s.type === 'candidate-pair' && (s.id === transport?.selectedCandidatePairId || s.nominated === true || s.selected === true) && s.state === 'succeeded')
    ?? all.find(s => s.type === 'candidate-pair' && s.state === 'succeeded');
  const rtt = num(pair?.currentRoundTripTime);

  const counters = all
    .filter(s => s.type === 'inbound-rtp')
    .reduce<PacketCounters>((acc, s) => ({
      received: acc.received + (num(s.packetsReceived) ?? 0),
      lost: acc.lost + Math.max(0, num(s.packetsLost) ?? 0),
    }), { received: 0, lost: 0 });

  const received = counters.received - (previous?.received ?? 0);
  const lost = counters.lost - (previous?.lost ?? 0);
  const lossPct = received + lost > 0 ? Math.max(0, (lost / (received + lost)) * 100) : 0;

  return { rttMs: rtt === null ? null : Math.round(rtt * 1000), lossPct, counters };
}

/** Thresholds where calls start to feel laggy or break up. */
export function rateQuality(rttMs: number | null, lossPct: number): QualityLevel {
  if ((rttMs ?? 0) > 400 || lossPct > 8) return 'poor';
  if ((rttMs ?? 0) > 150 || lossPct > 2) return 'fair';
  return 'good';
}
