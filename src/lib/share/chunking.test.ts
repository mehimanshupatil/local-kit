import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, Reassembler, chunkCount, readChunks } from './chunking';

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
});

describe('Reassembler', () => {
  it('round-trips bytes through readChunks', async () => {
    const original = bytes(CHUNK_SIZE * 2 + 123);
    const assembler = new Reassembler(original.length);
    for (const { index, data } of await collect(new Blob([original]))) assembler.add(index, data);
    expect(assembler.complete).toBe(true);
    expect(new Uint8Array(await assembler.toBlob().arrayBuffer())).toEqual(original);
  });

  it('accepts chunks out of order and tracks progress', async () => {
    const original = bytes(25);
    const chunks = await collect(new Blob([original]), 10);
    const assembler = new Reassembler(25, 10);
    assembler.add(2, chunks[2].data);
    assembler.add(0, chunks[0].data);
    expect(assembler.received).toBe(15);
    expect(assembler.complete).toBe(false);
    assembler.add(1, chunks[1].data);
    expect(new Uint8Array(await assembler.toBlob().arrayBuffer())).toEqual(original);
  });

  it('keeps the MIME type', () => {
    const assembler = new Reassembler(3, 10);
    assembler.add(0, new ArrayBuffer(3));
    expect(assembler.toBlob('image/png').type).toBe('image/png');
  });

  it('is complete immediately for an empty file', () => {
    const assembler = new Reassembler(0);
    expect(assembler.complete).toBe(true);
    expect(assembler.toBlob().size).toBe(0);
  });

  it('rejects out-of-range, duplicate and wrong-length chunks', () => {
    const assembler = new Reassembler(25, 10);
    expect(() => assembler.add(3, new ArrayBuffer(10))).toThrow(/out of range/);
    expect(() => assembler.add(-1, new ArrayBuffer(10))).toThrow(/out of range/);
    expect(() => assembler.add(0, new ArrayBuffer(9))).toThrow(/expected 10/);
    expect(() => assembler.add(2, new ArrayBuffer(10))).toThrow(/expected 5/);
    assembler.add(0, new ArrayBuffer(10));
    expect(() => assembler.add(0, new ArrayBuffer(10))).toThrow(/twice/);
  });

  it('refuses to build an incomplete file', () => {
    const assembler = new Reassembler(25, 10);
    assembler.add(0, new ArrayBuffer(10));
    expect(() => assembler.toBlob()).toThrow(/Missing 2 of 3/);
  });

  it('rejects an invalid size', () => {
    expect(() => new Reassembler(-1)).toThrow();
    expect(() => new Reassembler(1.5)).toThrow();
  });
});
