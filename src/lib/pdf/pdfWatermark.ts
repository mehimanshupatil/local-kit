import { PDFDocument, rgb, StandardFonts, degrees } from '@cantoo/pdf-lib';

export interface WatermarkOptions {
  text: string;
  fontSize?: number;
  opacity?: number;
  color?: [number, number, number]; // rgb 0-1
  rotation?: number; // degrees
}

export async function watermarkPDF(
  buffer: ArrayBuffer,
  opts: WatermarkOptions,
  onProgress?: (pct: number) => void
): Promise<Blob> {
  const doc = await PDFDocument.load(buffer);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const pages = doc.getPages();
  const { text, fontSize = 60, opacity = 0.25, color = [0.5, 0.5, 0.5], rotation = 45 } = opts;
  const [r, g, b] = color;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    const textHeight = font.heightAtSize(fontSize);
    page.drawText(text, {
      x: (width - textWidth) / 2,
      y: (height - textHeight) / 2,
      size: fontSize,
      font,
      color: rgb(r, g, b),
      opacity,
      rotate: degrees(rotation),
    });
    onProgress?.(Math.round(((i + 1) / pages.length) * 100));
  }

  const bytes = await doc.save();
  return new Blob([bytes], { type: 'application/pdf' });
}
