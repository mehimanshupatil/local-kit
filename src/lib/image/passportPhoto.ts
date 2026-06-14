export interface PassportStandard {
  id: string;
  country: string;
  widthMm: number;
  heightMm: number;
  /** Head (chin to crown) min as fraction of photo height */
  faceMin: number;
  /** Head (chin to crown) max as fraction of photo height */
  faceMax: number;
  /** Approximate vertical centre of the face oval as fraction of photo height */
  faceCenterY: number;
}

export const PASSPORT_STANDARDS: PassportStandard[] = [
  { id: 'icao', country: 'ICAO (International)', widthMm: 35, heightMm: 45, faceMin: 0.70, faceMax: 0.80, faceCenterY: 0.45 },
  { id: 'us',   country: 'USA',                  widthMm: 51, heightMm: 51, faceMin: 0.50, faceMax: 0.69, faceCenterY: 0.45 },
  { id: 'india',country: 'India',                widthMm: 51, heightMm: 51, faceMin: 0.70, faceMax: 0.80, faceCenterY: 0.45 },
  { id: 'uk',   country: 'UK',                   widthMm: 35, heightMm: 45, faceMin: 0.70, faceMax: 0.80, faceCenterY: 0.45 },
  { id: 'canada',country: 'Canada',              widthMm: 50, heightMm: 70, faceMin: 0.60, faceMax: 0.75, faceCenterY: 0.43 },
  { id: 'china',country: 'China',                widthMm: 33, heightMm: 48, faceMin: 0.60, faceMax: 0.75, faceCenterY: 0.45 },
];

export const DPI_OPTIONS = [150, 300, 600] as const;
export type DpiOption = typeof DPI_OPTIONS[number];

export function getOutputPixels(std: PassportStandard, dpi: DpiOption) {
  return {
    width:  Math.round((std.widthMm  / 25.4) * dpi),
    height: Math.round((std.heightMm / 25.4) * dpi),
  };
}

export async function renderPassportPhoto(
  sourceImg: HTMLImageElement,
  cropPx: { x: number; y: number; width: number; height: number },
  /** Natural-image scale: crop coords are in preview px — multiply by this to get natural px */
  previewScale: number,
  outputW: number,
  outputH: number,
  bgColor: string = '#ffffff',
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width  = outputW;
  canvas.height = outputH;
  const ctx = canvas.getContext('2d')!;

  // Fill background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, outputW, outputH);

  // Draw the cropped region scaled to output size
  const sx = cropPx.x * previewScale;
  const sy = cropPx.y * previewScale;
  const sw = cropPx.width  * previewScale;
  const sh = cropPx.height * previewScale;
  ctx.drawImage(sourceImg, sx, sy, sw, sh, 0, 0, outputW, outputH);

  return new Promise<Blob>((res, rej) =>
    canvas.toBlob(b => b ? res(b) : rej(new Error('toBlob failed')), 'image/jpeg', 0.95)
  );
}
