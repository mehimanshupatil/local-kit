import { PDFDocument } from '@cantoo/pdf-lib';

export async function reorderPDF(
  buffer: ArrayBuffer,
  pageOrder: number[], // new page order, 0-indexed
  onProgress?: (pct: number) => void
): Promise<Blob> {
  const src = await PDFDocument.load(buffer);
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, pageOrder);
  pages.forEach(p => out.addPage(p));
  onProgress?.(100);
  const bytes = await out.save();
  return new Blob([bytes], { type: 'application/pdf' });
}
