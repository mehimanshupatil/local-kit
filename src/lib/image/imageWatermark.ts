export type WatermarkPosition = 'tl' | 'tc' | 'tr' | 'ml' | 'mc' | 'mr' | 'bl' | 'bc' | 'br';

export interface WatermarkOptions {
  text: string;
  fontSize: number;
  color: string;
  opacity: number;
  position: WatermarkPosition;
  rotation: number;
  padding: number;
  repeat: boolean;
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
    img.src = url;
  });
}

function getAnchorPoint(
  pos: WatermarkPosition,
  canvasW: number,
  canvasH: number,
  pad: number,
): { x: number; y: number; textAlign: CanvasTextAlign; textBaseline: CanvasTextBaseline } {
  const col = pos[1] as 'l' | 'c' | 'r';
  const row = pos[0] as 't' | 'm' | 'b';
  let x: number, textAlign: CanvasTextAlign;
  if (col === 'l') { x = pad; textAlign = 'left'; }
  else if (col === 'r') { x = canvasW - pad; textAlign = 'right'; }
  else { x = canvasW / 2; textAlign = 'center'; }
  let y: number, textBaseline: CanvasTextBaseline;
  if (row === 't') { y = pad; textBaseline = 'top'; }
  else if (row === 'b') { y = canvasH - pad; textBaseline = 'bottom'; }
  else { y = canvasH / 2; textBaseline = 'middle'; }
  return { x, y, textAlign, textBaseline };
}

function drawSingle(
  ctx: CanvasRenderingContext2D,
  canvasW: number, canvasH: number,
  fontSize: number, padding: number,
  opts: WatermarkOptions,
): void {
  ctx.font = `bold ${fontSize}px sans-serif`;
  const { x, y, textAlign, textBaseline } = getAnchorPoint(opts.position, canvasW, canvasH, padding);
  ctx.textAlign = textAlign;
  ctx.textBaseline = textBaseline;
  if (opts.rotation !== 0) {
    ctx.translate(x, y);
    ctx.rotate((opts.rotation * Math.PI) / 180);
    ctx.fillText(opts.text, 0, 0);
  } else {
    ctx.fillText(opts.text, x, y);
  }
}

function drawTiled(
  ctx: CanvasRenderingContext2D,
  canvasW: number, canvasH: number,
  fontSize: number,
  opts: WatermarkOptions,
): void {
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const textW = ctx.measureText(opts.text).width;
  const colGap = textW + fontSize * 2;
  const rowGap = fontSize * 3.5;
  const angle = (opts.rotation || -30) * Math.PI / 180;

  // Rotate the whole pattern from canvas center
  ctx.translate(canvasW / 2, canvasH / 2);
  ctx.rotate(angle);

  const diagonal = Math.sqrt(canvasW * canvasW + canvasH * canvasH);
  const cols = Math.ceil(diagonal / colGap) + 2;
  const rows = Math.ceil(diagonal / rowGap) + 2;

  for (let row = -rows; row <= rows; row++) {
    const offset = (row % 2 === 0) ? 0 : colGap / 2;
    for (let col = -cols; col <= cols; col++) {
      ctx.fillText(opts.text, col * colGap + offset, row * rowGap);
    }
  }
}

export async function applyWatermark(file: File, opts: WatermarkOptions): Promise<Blob> {
  const img = await loadImage(file);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);

  ctx.save();
  ctx.globalAlpha = opts.opacity / 100;
  ctx.fillStyle = hexToRgba(opts.color, 1);

  if (opts.repeat) {
    drawTiled(ctx, canvas.width, canvas.height, opts.fontSize, opts);
  } else {
    drawSingle(ctx, canvas.width, canvas.height, opts.fontSize, opts.padding, opts);
  }

  ctx.restore();

  return new Promise<Blob>((resolve, reject) => {
    const mime = file.type === 'image/jpeg' ? 'image/jpeg'
      : file.type === 'image/webp' ? 'image/webp' : 'image/png';
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('Canvas toBlob failed')),
      mime,
      mime === 'image/png' ? undefined : 0.92,
    );
  });
}

export function drawWatermarkOnCanvas(
  ctx: CanvasRenderingContext2D,
  canvasW: number, canvasH: number,
  scale: number,
  opts: WatermarkOptions,
): void {
  ctx.save();
  ctx.globalAlpha = opts.opacity / 100;
  ctx.fillStyle = hexToRgba(opts.color, 1);

  const scaledFontSize = Math.max(8, Math.round(opts.fontSize * scale));
  const scaledPadding = Math.round(opts.padding * scale);

  if (opts.repeat) {
    drawTiled(ctx, canvasW, canvasH, scaledFontSize, opts);
  } else {
    drawSingle(ctx, canvasW, canvasH, scaledFontSize, scaledPadding, opts);
  }

  ctx.restore();
}
