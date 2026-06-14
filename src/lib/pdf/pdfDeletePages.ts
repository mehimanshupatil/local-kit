import { PDFDocument } from '@cantoo/pdf-lib';

export async function deletePages(
  buffer: ArrayBuffer,
  pagesToDelete: Set<number>, // 0-indexed
  onProgress?: (pct: number) => void
): Promise<Blob> {
  const src = await PDFDocument.load(buffer);
  const totalPages = src.getPageCount();
  const keepOrder = Array.from({ length: totalPages }, (_, i) => i).filter(i => !pagesToDelete.has(i));
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, keepOrder);
  pages.forEach(p => out.addPage(p));
  onProgress?.(100);
  const bytes = await out.save();
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
}
