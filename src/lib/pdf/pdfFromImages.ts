import { PDFDocument } from '@cantoo/pdf-lib';

export async function imagesToPDF(
  files: { buffer: ArrayBuffer; type: string }[],
  onProgress?: (pct: number) => void
): Promise<Blob> {
  const doc = await PDFDocument.create();

  for (let i = 0; i < files.length; i++) {
    const { buffer, type } = files[i];

    let image;
    if (type === 'image/jpeg' || type === 'image/jpg') {
      image = await doc.embedJpg(buffer);
    } else {
      image = await doc.embedPng(buffer);
    }

    const page = doc.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
    onProgress?.(Math.round(((i + 1) / files.length) * 90));
  }

  const bytes = await doc.save();
  onProgress?.(100);
  return new Blob([bytes], { type: 'application/pdf' });
}
