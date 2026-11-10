import { describe, expect, it } from 'vitest';
import {
  DESKTOP_MEMORY_LIMIT, InOrderBuffer, MOBILE_MEMORY_LIMIT, SpeedMeter,
  batchProgress, candidateNames, planReceive,
} from './transfer';

describe('planReceive', () => {
  const desktop = { mobile: false, canSaveToDisk: false };
  const mobile = { mobile: true, canSaveToDisk: false };

  it('keeps batches up to the limit in memory', () => {
    expect(planReceive(DESKTOP_MEMORY_LIMIT, desktop)).toEqual({ kind: 'memory', canSaveToDisk: false });
    expect(planReceive(MOBILE_MEMORY_LIMIT, mobile)).toEqual({ kind: 'memory', canSaveToDisk: false });
  });

  it('uses the lower limit on mobile', () => {
    expect(planReceive(MOBILE_MEMORY_LIMIT + 1, desktop).kind).toBe('memory');
    expect(planReceive(MOBILE_MEMORY_LIMIT + 1, mobile)).toEqual({ kind: 'too-large', limit: MOBILE_MEMORY_LIMIT });
  });

  it('requires saving to disk above the limit where supported', () => {
    expect(planReceive(DESKTOP_MEMORY_LIMIT + 1, { mobile: false, canSaveToDisk: true })).toEqual({ kind: 'disk-only' });
    expect(planReceive(DESKTOP_MEMORY_LIMIT + 1, desktop)).toEqual({ kind: 'too-large', limit: DESKTOP_MEMORY_LIMIT });
  });

  it('offers disk as an option for small batches where supported', () => {
    expect(planReceive(10, { mobile: false, canSaveToDisk: true })).toEqual({ kind: 'memory', canSaveToDisk: true });
  });
});

describe('batchProgress', () => {
  it('counts earlier files as done and later ones as not started', () => {
    expect(batchProgress([100, 200, 100], 1, 50)).toEqual({ files: [100, 25, 0], overall: 37, bytes: 150, totalBytes: 400 });
  });

  it('is 0% at the start and 100% at the end', () => {
    expect(batchProgress([10, 10], 0, 0).overall).toBe(0);
    expect(batchProgress([10, 10], 1, 10)).toMatchObject({ files: [100, 100], overall: 100 });
    // Past the last file (every file finished)
    expect(batchProgress([10, 10], 2, 0)).toMatchObject({ files: [100, 100], overall: 100 });
  });

  it('treats empty files and empty batches as complete', () => {
    expect(batchProgress([0, 10], 0, 0).files).toEqual([100, 0]);
    expect(batchProgress([], 0, 0).overall).toBe(100);
  });

  it('never reports more than 100%', () => {
    expect(batchProgress([10], 0, 25)).toMatchObject({ files: [100], bytes: 10 });
  });

  it('rounds down so a nearly-done transfer never shows 100%', () => {
    expect(batchProgress([1000], 0, 999).overall).toBe(99);
  });
});

describe('SpeedMeter', () => {
  it('is 0 until there are two samples', () => {
    const meter = new SpeedMeter();
    expect(meter.bytesPerSecond()).toBe(0);
    meter.record(1000, 0);
    expect(meter.bytesPerSecond()).toBe(0);
  });

  it('averages over the samples it has', () => {
    const meter = new SpeedMeter();
    meter.record(0, 0);
    meter.record(500, 500);
    meter.record(2000, 1000);
    expect(meter.bytesPerSecond()).toBe(2000);
  });

  it('forgets samples older than the window', () => {
    const meter = new SpeedMeter(1000);
    meter.record(0, 0);
    meter.record(10_000, 1000); // a fast first second
    meter.record(10_100, 2000); // then it slows right down
    meter.record(10_200, 3000);
    expect(meter.bytesPerSecond()).toBe(100);
  });

  it('handles two samples at the same instant', () => {
    const meter = new SpeedMeter();
    meter.record(0, 5);
    meter.record(100, 5);
    expect(meter.bytesPerSecond()).toBe(0);
  });
});

describe('InOrderBuffer', () => {
  it('releases in-order items straight away', () => {
    const buffer = new InOrderBuffer<string>();
    expect(buffer.push(0, 'a')).toEqual(['a']);
    expect(buffer.push(1, 'b')).toEqual(['b']);
  });

  it('holds early items until the gap fills, then releases the run', () => {
    const buffer = new InOrderBuffer<string>();
    expect(buffer.push(2, 'c')).toEqual([]);
    expect(buffer.push(1, 'b')).toEqual([]);
    expect(buffer.pending).toBe(2);
    expect(buffer.push(0, 'a')).toEqual(['a', 'b', 'c']);
    expect(buffer.pending).toBe(0);
  });

  it('rejects duplicates, whether released or still waiting', () => {
    const buffer = new InOrderBuffer<string>();
    buffer.push(0, 'a');
    buffer.push(2, 'c');
    expect(() => buffer.push(0, 'a')).toThrow(/twice/);
    expect(() => buffer.push(2, 'c')).toThrow(/twice/);
  });
});

describe('candidateNames', () => {
  const first = (name: string, n: number) => {
    const out: string[] = [];
    for (const c of candidateNames(name)) {
      out.push(c);
      if (out.length === n) break;
    }
    return out;
  };

  it('numbers before the extension', () => {
    expect(first('photo.jpg', 3)).toEqual(['photo.jpg', 'photo (1).jpg', 'photo (2).jpg']);
  });

  it('uses only the last extension', () => {
    expect(first('backup.tar.gz', 2)).toEqual(['backup.tar.gz', 'backup.tar (1).gz']);
  });

  it('handles names without an extension and dotfiles', () => {
    expect(first('README', 2)).toEqual(['README', 'README (1)']);
    expect(first('.env', 2)).toEqual(['.env', '.env (1)']);
  });
});
