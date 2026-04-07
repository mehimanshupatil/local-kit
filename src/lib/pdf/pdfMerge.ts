import { PDFDocument } from '@cantoo/pdf-lib';

export async function mergePDFs(
  buffers: ArrayBuffer[],
  onProgress?: (pct: number) => void
): Promise<Blob> {
  const merged = await PDFDocument.create();

  for (let i = 0; i < buffers.length; i++) {
    const doc = await PDFDocument.load(buffers[i]);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    pages.forEach(p => merged.addPage(p));
    onProgress?.(Math.round(((i + 1) / buffers.length) * 90));
  }

  const bytes = await merged.save();
  onProgress?.(100);
  return new Blob([bytes], { type: 'application/pdf' });
}
