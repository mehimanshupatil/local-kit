/** Most a desktop browser can comfortably hold in memory for one incoming batch. */
export const DESKTOP_MEMORY_LIMIT = 2 * 1024 ** 3;
/** Mobile browsers get killed well before desktop ones under memory pressure. */
export const MOBILE_MEMORY_LIMIT = 500 * 1024 ** 2;

export type ReceivePlan =
  /** Fits in memory; saving to a folder is offered too where supported. */
  | { kind: 'memory'; canSaveToDisk: boolean }
  /** Too big for memory, but can stream straight to a folder. */
  | { kind: 'disk-only' }
  /** Too big for memory and this browser can't stream to disk. */
  | { kind: 'too-large'; limit: number };

export function planReceive(totalBytes: number, { mobile, canSaveToDisk }: { mobile: boolean; canSaveToDisk: boolean }): ReceivePlan {
  const limit = mobile ? MOBILE_MEMORY_LIMIT : DESKTOP_MEMORY_LIMIT;
  if (totalBytes <= limit) return { kind: 'memory', canSaveToDisk };
  return canSaveToDisk ? { kind: 'disk-only' } : { kind: 'too-large', limit };
}

export interface BatchProgress {
  /** Percent done (0–100) per file. */
  files: number[];
  /** Percent done (0–100) across the whole batch, weighted by size. */
  overall: number;
  bytes: number;
  totalBytes: number;
}

const pct = (done: number, total: number) => (total === 0 ? 100 : Math.min(100, Math.floor((done / total) * 100)));

/**
 * Progress through files sent one after another: every file before `fileIndex`
 * is complete, `fileBytes` of file `fileIndex` are done, the rest haven't started.
 */
export function batchProgress(sizes: number[], fileIndex: number, fileBytes: number): BatchProgress {
  const totalBytes = sizes.reduce((a, b) => a + b, 0);
  let bytes = 0;
  const files = sizes.map((size, i) => {
    if (i < fileIndex) { bytes += size; return 100; }
    if (i > fileIndex) return 0;
    const done = Math.min(fileBytes, size);
    bytes += done;
    return pct(done, size);
  });
  return { files, overall: pct(bytes, totalBytes), bytes, totalBytes };
}

/** Transfer rate over a sliding window, so the number settles instead of jittering per chunk. */
export class SpeedMeter {
  private samples: { t: number; bytes: number }[] = [];

  constructor(private readonly windowMs = 3000) {}

  /** Record the running total of bytes transferred at time `now` (ms). */
  record(bytes: number, now: number): void {
    this.samples.push({ t: now, bytes });
    const cutoff = now - this.windowMs;
    // Keep one sample at or before the cutoff so the window always spans windowMs
    while (this.samples.length > 2 && this.samples[1].t <= cutoff) this.samples.shift();
  }

  /** Bytes per second across the window, or 0 until there are two samples. */
  bytesPerSecond(): number {
    if (this.samples.length < 2) return 0;
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    const ms = last.t - first.t;
    return ms > 0 ? ((last.bytes - first.bytes) / ms) * 1000 : 0;
  }
}

/** Releases chunks strictly in index order, holding back any that arrive early. */
export class InOrderBuffer<T> {
  private next = 0;
  private early = new Map<number, T>();

  push(index: number, item: T): T[] {
    if (index < this.next || this.early.has(index)) throw new Error(`Chunk ${index} arrived twice`);
    this.early.set(index, item);
    const ready: T[] = [];
    while (this.early.has(this.next)) {
      ready.push(this.early.get(this.next)!);
      this.early.delete(this.next);
      this.next++;
    }
    return ready;
  }

  /** Chunks waiting on an earlier one. */
  get pending(): number {
    return this.early.size;
  }
}

/** "photo.jpg", then "photo (1).jpg", "photo (2).jpg", … for saving without overwriting. */
export function* candidateNames(name: string): Generator<string> {
  yield name;
  const dot = name.lastIndexOf('.');
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
  for (let n = 1; ; n++) yield `${stem} (${n})${ext}`;
}
