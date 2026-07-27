export interface FaviconOutput {
  name: string;
  blob: Blob;
}

const PNG_OUTPUTS: { name: string; size: number }[] = [
  { name: 'favicon-16x16.png', size: 16 },
  { name: 'favicon-32x32.png', size: 32 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'android-chrome-192x192.png', size: 192 },
  { name: 'android-chrome-512x512.png', size: 512 },
];

const ICO_SIZES = [16, 32, 48];

export function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not load image')); };
    img.src = url;
  });
}

/** Center-crops the image to a square at its native resolution (no resizing). */
export function cropToSquareCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - side) / 2;
  const sy = (img.naturalHeight - side) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, sx, sy, side, side, 0, 0, side, side);
  return canvas;
}

function resizeCanvas(source: HTMLCanvasElement, size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, size, size);
  return canvas;
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas toBlob failed')), 'image/png');
  });
}

async function buildIco(pngBuffers: ArrayBuffer[]): Promise<Blob> {
  const headerSize = 6;
  const dirEntrySize = 16;
  const dirSize = dirEntrySize * pngBuffers.length;
  const headerAndDir = new ArrayBuffer(headerSize + dirSize);
  const view = new DataView(headerAndDir);

  view.setUint16(0, 0, true); // reserved
  view.setUint16(2, 1, true); // type: icon
  view.setUint16(4, pngBuffers.length, true);

  let offset = headerSize + dirSize;
  pngBuffers.forEach((buf, i) => {
    const entryOffset = headerSize + i * dirEntrySize;
    const dim = ICO_SIZES[i];
    view.setUint8(entryOffset + 0, dim === 256 ? 0 : dim); // width
    view.setUint8(entryOffset + 1, dim === 256 ? 0 : dim); // height
    view.setUint8(entryOffset + 2, 0); // color count
    view.setUint8(entryOffset + 3, 0); // reserved
    view.setUint16(entryOffset + 4, 1, true); // color planes
    view.setUint16(entryOffset + 6, 32, true); // bits per pixel
    view.setUint32(entryOffset + 8, buf.byteLength, true); // image data size
    view.setUint32(entryOffset + 12, offset, true); // image data offset
    offset += buf.byteLength;
  });

  return new Blob([headerAndDir, ...pngBuffers], { type: 'image/x-icon' });
}

export function buildHtmlSnippet(): string {
  return [
    '<link rel="icon" href="/favicon.ico" sizes="any">',
    '<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">',
    '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">',
    '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">',
    '<link rel="icon" type="image/png" sizes="192x192" href="/android-chrome-192x192.png">',
    '<link rel="icon" type="image/png" sizes="512x512" href="/android-chrome-512x512.png">',
  ].join('\n');
}

export async function generateFavicons(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<FaviconOutput[]> {
  const img = await loadImage(file);
  const base = cropToSquareCanvas(img);
  const outputs: FaviconOutput[] = [];

  const icoCanvasesBySize = new Map<number, HTMLCanvasElement>();
  const allSizesNeeded = new Set([...PNG_OUTPUTS.map(o => o.size), ...ICO_SIZES]);
  const totalSteps = allSizesNeeded.size + 1; // +1 for the .ico assembly step
  let step = 0;

  for (const size of allSizesNeeded) {
    icoCanvasesBySize.set(size, resizeCanvas(base, size));
    step++;
    onProgress?.(Math.round((step / totalSteps) * 90));
  }

  for (const { name, size } of PNG_OUTPUTS) {
    const blob = await canvasToPngBlob(icoCanvasesBySize.get(size)!);
    outputs.push({ name, blob });
  }

  const icoPngBuffers = await Promise.all(
    ICO_SIZES.map(size => canvasToPngBlob(icoCanvasesBySize.get(size)!).then(b => b.arrayBuffer()))
  );
  const icoBlob = await buildIco(icoPngBuffers);
  outputs.push({ name: 'favicon.ico', blob: icoBlob });
  onProgress?.(95);

  outputs.push({ name: 'favicon-snippet.txt', blob: new Blob([buildHtmlSnippet()], { type: 'text/plain' }) });
  onProgress?.(100);

  return outputs;
}
