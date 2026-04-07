import { loadPDFDocument } from './pdfLoader';
import { stripExtension } from '@/lib/utils/fileUtils';

export async function pdfToImages(
  buffer: ArrayBuffer,
  filename: string,
  scale = 1.5,
  onProgress?: (pct: number) => void
): Promise<{ name: string; blob: Blob }[]> {
  const pdfDoc = await loadPDFDocument(buffer);
  const total = pdfDoc.numPages;
  const base = stripExtension(filename);
  const results: { name: string; blob: Blob }[] = [];

  for (let i = 1; i <= total; i++) {
    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;

    await page.render({ canvasContext: ctx, viewport }).promise;

    const blob = await new Promise<Blob>((res) =>
      canvas.toBlob(b => res(b!), 'image/png')
    );

    results.push({ name: `${base}_page${i}.png`, blob });
    onProgress?.(Math.round((i / total) * 100));
  }

  return results;
}
