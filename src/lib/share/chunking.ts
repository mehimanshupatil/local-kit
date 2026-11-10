/**
 * Bytes per chunk sent over the data channel. Trystero sends a message that fits
 * in one 16 KiB frame (with its header and our metadata) inline; anything larger
 * goes through an offer/accept round trip per message, which caps throughput at
 * a few MB/s. 512 bytes of headroom covers the header and chunk metadata.
 */
export const CHUNK_SIZE = 16 * 1024 - 512;

export function chunkCount(size: number, chunkSize = CHUNK_SIZE): number {
  return Math.ceil(size / chunkSize);
}

export interface Chunk {
  index: number;
  data: ArrayBuffer;
}

/** Bytes read from the file per disk read; each read is split into many chunks. */
export const READ_SIZE = 1024 * 1024;

/** Read a file in chunks, a block at a time, so a large file is never held in memory whole. */
export async function* readChunks(blob: Blob, chunkSize = CHUNK_SIZE, readSize = READ_SIZE): AsyncGenerator<Chunk> {
  // Whole chunks per read so chunk boundaries never straddle two reads
  const block = Math.max(1, Math.floor(readSize / chunkSize)) * chunkSize;
  let index = 0;
  for (let start = 0; start < blob.size; start += block) {
    const buffer = await blob.slice(start, start + block).arrayBuffer();
    for (let offset = 0; offset < buffer.byteLength; offset += chunkSize) {
      yield { index: index++, data: buffer.slice(offset, offset + chunkSize) };
    }
  }
}
