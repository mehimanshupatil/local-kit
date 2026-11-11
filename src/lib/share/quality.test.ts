import { describe, expect, it } from 'vitest';
import { rateQuality, readStats } from './quality';

const pair = (id: string, rtt: number, extra: Record<string, unknown> = {}) =>
  ({ type: 'candidate-pair', id, state: 'succeeded', currentRoundTripTime: rtt, ...extra });
const inbound = (packetsReceived: number, packetsLost: number) => ({ type: 'inbound-rtp', packetsReceived, packetsLost });

describe('readStats', () => {
  it('takes round trip from the selected candidate pair', () => {
    const stats = [
      pair('a', 0.5),
      pair('b', 0.042),
      { type: 'transport', selectedCandidatePairId: 'b' },
    ];
    expect(readStats(stats, null).rttMs).toBe(42);
  });

  it('falls back to a nominated, then any succeeded pair', () => {
    expect(readStats([pair('a', 0.3), pair('b', 0.02, { nominated: true })], null).rttMs).toBe(20);
    expect(readStats([{ type: 'candidate-pair', state: 'failed', currentRoundTripTime: 1 }, pair('c', 0.1)], null).rttMs).toBe(100);
  });

  it('has no round trip before a pair succeeds', () => {
    expect(readStats([{ type: 'candidate-pair', state: 'in-progress' }], null).rttMs).toBeNull();
  });

  it('adds up loss across audio and video', () => {
    const { lossPct, counters } = readStats([inbound(900, 50), inbound(90, 10)], null);
    expect(counters).toEqual({ received: 990, lost: 60 });
    expect(lossPct).toBeCloseTo((60 / 1050) * 100);
  });

  it('measures loss since the previous sample only', () => {
    const first = readStats([inbound(1000, 100)], null);
    // 100 more packets, none lost: a clean interval despite the bad start
    expect(readStats([inbound(1100, 100)], first.counters).lossPct).toBe(0);
    expect(readStats([inbound(1190, 110)], first.counters).lossPct).toBeCloseTo((10 / 200) * 100);
  });

  it('is zero with no traffic and ignores negative loss counts', () => {
    expect(readStats([], null).lossPct).toBe(0);
    expect(readStats([inbound(100, -3)], null).lossPct).toBe(0);
  });
});

describe('rateQuality', () => {
  it('grades by round trip and loss, whichever is worse', () => {
    expect(rateQuality(40, 0)).toBe('good');
    expect(rateQuality(null, 0)).toBe('good');
    expect(rateQuality(200, 0)).toBe('fair');
    expect(rateQuality(40, 5)).toBe('fair');
    expect(rateQuality(500, 0)).toBe('poor');
    expect(rateQuality(40, 12)).toBe('poor');
  });
});
