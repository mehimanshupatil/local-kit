/** Bytes per chunk sent over the data channel. */
export const CHUNK_SIZE = 64 * 1024;

export function chunkCount(size: number, chunkSize = CHUNK_SIZE): number {
  return Math.ceil(size / chunkSize);
}

export interface Chunk {
  index: number;
  data: ArrayBuffer;
}

/** Read a file one chunk at a time so a large file is never held in memory twice. */
export async function* readChunks(blob: Blob, chunkSize = CHUNK_SIZE): AsyncGenerator<Chunk> {
  const total = chunkCount(blob.size, chunkSize);
  for (let index = 0; index < total; index++) {
    const start = index * chunkSize;
    yield { index, data: await blob.slice(start, start + chunkSize).arrayBuffer() };
  }
}

/** Rebuilds a file from chunks, which may arrive in any order. */
export class Reassembler {
  readonly total: number;
  private readonly chunks: (ArrayBuffer | undefined)[];
  private receivedBytes = 0;
  private receivedCount = 0;

  constructor(readonly size: number, readonly chunkSize = CHUNK_SIZE) {
    if (!Number.isSafeInteger(size) || size < 0) throw new Error(`Invalid file size: ${size}`);
    this.total = chunkCount(size, chunkSize);
    this.chunks = new Array(this.total);
  }

  /** Expected byte length of chunk `index`: full size for all but the last. */
  private expectedLength(index: number): number {
    return index === this.total - 1 ? this.size - index * this.chunkSize : this.chunkSize;
  }

  add(index: number, data: ArrayBuffer): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.total) {
      throw new Error(`Chunk ${index} is out of range (expected 0–${this.total - 1})`);
    }
    if (this.chunks[index]) throw new Error(`Chunk ${index} arrived twice`);
    if (data.byteLength !== this.expectedLength(index)) {
      throw new Error(`Chunk ${index} is ${data.byteLength} bytes, expected ${this.expectedLength(index)}`);
    }
    this.chunks[index] = data;
    this.receivedBytes += data.byteLength;
    this.receivedCount++;
  }

  get received(): number {
    return this.receivedBytes;
  }

  get complete(): boolean {
    return this.receivedCount === this.total;
  }

  toBlob(type = ''): Blob {
    if (!this.complete) throw new Error(`Missing ${this.total - this.receivedCount} of ${this.total} chunks`);
    return new Blob(this.chunks as ArrayBuffer[], { type });
  }
}
