import { PDFDocument, degrees } from '@cantoo/pdf-lib';
import { stripExtension } from '@/lib/utils/fileUtils';

export async function rotatePDF(
  buffer: ArrayBuffer,
  filename: string,
  rotation: 90 | 180 | 270,
  pageIndices?: number[], // undefined = all pages
  onProgress?: (pct: number) => void
): Promise<{ name: string; blob: Blob }> {
  const doc = await PDFDocument.load(buffer);
  const pages = doc.getPages();
  const targets = pageIndices ?? pages.map((_, i) => i);

  for (let i = 0; i < targets.length; i++) {
    const page = pages[targets[i]];
    const current = page.getRotation().angle;
    page.setRotation(degrees((current + rotation) % 360));
    onProgress?.(Math.round(((i + 1) / targets.length) * 90));
  }

  const bytes = await doc.save();
  onProgress?.(100);
  return {
    name: `${stripExtension(filename)}_rotated.pdf`,
    blob: new Blob([bytes], { type: 'application/pdf' }),
  };
}
