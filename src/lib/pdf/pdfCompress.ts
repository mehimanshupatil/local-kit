import { PDFDocument } from '@cantoo/pdf-lib';
import { stripExtension } from '@/lib/utils/fileUtils';

export async function compressPDF(
  buffer: ArrayBuffer,
  filename: string,
  onProgress?: (pct: number) => void
): Promise<{ name: string; blob: Blob; originalSize: number; newSize: number }> {
  onProgress?.(20);

  // Re-save with pdf-lib which removes accumulated garbage and packs object streams
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  onProgress?.(60);

  const bytes = await doc.save({ useObjectStreams: true, addDefaultPage: false });
  onProgress?.(100);

  const blob = new Blob([bytes], { type: 'application/pdf' });
  return {
    name: `${stripExtension(filename)}_compressed.pdf`,
    blob,
    originalSize: buffer.byteLength,
    newSize: bytes.byteLength,
  };
}
