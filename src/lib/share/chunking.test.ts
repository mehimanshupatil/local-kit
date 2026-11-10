import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, chunkCount, readChunks } from './chunking';

const bytes = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + 7) % 256);

async function collect(blob: Blob, chunkSize?: number) {
  const out = [];
  for await (const chunk of readChunks(blob, chunkSize)) out.push(chunk);
  return out;
}

describe('chunkCount', () => {
  it('rounds up and is zero for an empty file', () => {
    expect(chunkCount(0)).toBe(0);
    expect(chunkCount(1)).toBe(1);
    expect(chunkCount(CHUNK_SIZE)).toBe(1);
    expect(chunkCount(CHUNK_SIZE + 1)).toBe(2);
  });
});

describe('readChunks', () => {
  it('splits into full chunks plus a short final chunk', async () => {
    const chunks = await collect(new Blob([bytes(25)]), 10);
    expect(chunks.map(c => c.index)).toEqual([0, 1, 2]);
    expect(chunks.map(c => c.data.byteLength)).toEqual([10, 10, 5]);
  });

  it('yields nothing for an empty blob', async () => {
    expect(await collect(new Blob([]), 10)).toEqual([]);
  });

  it('round-trips the bytes', async () => {
    const original = bytes(CHUNK_SIZE * 2 + 123);
    const chunks = await collect(new Blob([original]));
    expect(new Uint8Array(await new Blob(chunks.map(c => c.data)).arrayBuffer())).toEqual(original);
  });
});

describe('readChunks block reads', () => {
  it('keeps chunk boundaries when the read size is not a multiple of the chunk size', async () => {
    const original = bytes(100);
    const chunks = [];
    for await (const c of readChunks(new Blob([original]), 10, 25)) chunks.push(c);
    expect(chunks.map(c => c.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(chunks.every(c => c.data.byteLength === 10)).toBe(true);
    expect(new Uint8Array(await new Blob(chunks.map(c => c.data)).arrayBuffer())).toEqual(original);
  });

  it('reads at least one chunk per block when the read size is smaller than a chunk', async () => {
    const chunks = [];
    for await (const c of readChunks(new Blob([bytes(25)]), 10, 4)) chunks.push(c);
    expect(chunks.map(c => c.data.byteLength)).toEqual([10, 10, 5]);
  });

  it('fits a chunk and its metadata in one 16 KiB Trystero frame', () => {
    expect(CHUNK_SIZE).toBeLessThanOrEqual(16 * 1024 - 36 - 200);
  });
});
