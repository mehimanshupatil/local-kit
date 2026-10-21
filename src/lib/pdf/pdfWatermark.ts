import { PDFDocument, rgb, StandardFonts, StandardFontEmbedder, degrees } from '@cantoo/pdf-lib';

export interface WatermarkOptions {
  text: string;
  fontSize?: number;
  opacity?: number;
  color?: [number, number, number]; // rgb 0-1
  rotation?: number; // degrees
  /** Tile the text across the whole page; `gap` is the space between copies in points */
  repeat?: { gap: number };
}

export const WATERMARK_FONT = StandardFonts.HelveticaBold;

/** Width and cap height (no descender) of the watermark text, in PDF points */
export function measureWatermark(text: string, fontSize: number): { width: number; height: number } {
  // StandardFonts and the embedder's FontNames are separate enums with identical string values
  const metrics = StandardFontEmbedder.for(WATERMARK_FONT as unknown as Parameters<typeof StandardFontEmbedder.for>[0]);
  return {
    width: metrics.widthOfTextAtSize(text, fontSize),
    height: metrics.heightOfFontAtSize(fontSize, { descender: false }),
  };
}

/**
 * Baseline origin for drawing the text so it sits centred on the page.
 * PDF space (y up). pdf-lib rotates text counter-clockwise about this origin, so the
 * text's centre offset is rotated too — centring before rotating would shift it off-centre.
 */
export function watermarkPlacement(
  page: { width: number; height: number },
  textSize: { width: number; height: number },
  rotationDeg: number,
): { x: number; y: number } {
  return originForCentre({ x: page.width / 2, y: page.height / 2 }, textSize, rotationDeg);
}

/** Baseline origin that puts the rotated text's centre on `centre` */
function originForCentre(
  centre: { x: number; y: number },
  textSize: { width: number; height: number },
  rotationDeg: number,
): { x: number; y: number } {
  const rad = (rotationDeg * Math.PI) / 180;
  const cx = textSize.width / 2, cy = textSize.height / 2;
  return {
    x: centre.x - (cx * Math.cos(rad) - cy * Math.sin(rad)),
    y: centre.y - (cx * Math.sin(rad) + cy * Math.cos(rad)),
  };
}

/**
 * Every baseline origin to draw on a page: one centred copy, or with `repeat` a grid laid out
 * along the text's own direction (rows offset by half a step, brick-style) centred on the page.
 * Copies that can't overlap the page are dropped; the rest are clipped by the page itself.
 */
export function watermarkPlacements(
  page: { width: number; height: number },
  textSize: { width: number; height: number },
  rotationDeg: number,
  repeat?: { gap: number },
): { x: number; y: number }[] {
  if (!repeat) return [watermarkPlacement(page, textSize, rotationDeg)];

  const rad = (rotationDeg * Math.PI) / 180;
  const u = { x: Math.cos(rad), y: Math.sin(rad) };   // along the text
  const v = { x: -Math.sin(rad), y: Math.cos(rad) };  // perpendicular to it
  const stepU = textSize.width + repeat.gap;
  const stepV = textSize.height + repeat.gap;
  const reach = Math.hypot(page.width, page.height) / 2;  // page centre → farthest corner
  const halfText = Math.hypot(textSize.width, textSize.height) / 2;
  const nU = Math.ceil((reach + halfText) / stepU) + 1;
  const nV = Math.ceil((reach + halfText) / stepV) + 1;

  const origins: { x: number; y: number }[] = [];
  for (let j = -nV; j <= nV; j++) {
    const shift = Math.abs(j) % 2 === 1 ? stepU / 2 : 0;
    for (let i = -nU; i <= nU; i++) {
      const a = i * stepU + shift, b = j * stepV;
      const centre = { x: page.width / 2 + a * u.x + b * v.x, y: page.height / 2 + a * u.y + b * v.y };
      const outside = centre.x < -halfText || centre.x > page.width + halfText
        || centre.y < -halfText || centre.y > page.height + halfText;
      if (!outside) origins.push(originForCentre(centre, textSize, rotationDeg));
    }
  }
  return origins;
}

export async function watermarkPDF(
  buffer: ArrayBuffer,
  opts: WatermarkOptions,
  onProgress?: (pct: number) => void
): Promise<Blob> {
  const doc = await PDFDocument.load(buffer);
  const font = await doc.embedFont(WATERMARK_FONT);
  const pages = doc.getPages();
  const { text, fontSize = 60, opacity = 0.25, color = [0.5, 0.5, 0.5], rotation = 45, repeat } = opts;
  const [r, g, b] = color;
  const textSize = measureWatermark(text, fontSize);

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    for (const { x, y } of watermarkPlacements(page.getSize(), textSize, rotation, repeat)) {
      page.drawText(text, {
        x,
        y,
        size: fontSize,
        font,
        color: rgb(r, g, b),
        opacity,
        rotate: degrees(rotation),
      });
    }
    onProgress?.(Math.round(((i + 1) / pages.length) * 100));
  }

  const bytes = await doc.save();
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
}
