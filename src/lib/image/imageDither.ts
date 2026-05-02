export type DitherAlgorithm =
  | 'floyd-steinberg'
  | 'atkinson'
  | 'ordered-2x2'
  | 'ordered-4x4'
  | 'ordered-8x8'
  | 'random'
  | 'threshold';

export type PaletteMode = 'bw' | 'grayscale-4' | 'grayscale-8' | 'color-web';

export interface DitherOptions {
  algorithm: DitherAlgorithm;
  palette: PaletteMode;
  threshold: number;   // 0-255
  scale: number;       // 0.25–2.0
}

// ─── Bayer matrices ───────────────────────────────────────────────────────────

const BAYER_2: number[][] = [
  [0, 2],
  [3, 1],
];

const BAYER_4: number[][] = [
  [ 0,  8,  2, 10],
  [12,  4, 14,  6],
  [ 3, 11,  1,  9],
  [15,  7, 13,  5],
];

const BAYER_8: number[][] = [
  [ 0, 32,  8, 40,  2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44,  4, 36, 14, 46,  6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [ 3, 35, 11, 43,  1, 33,  9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47,  7, 39, 13, 45,  5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

// ─── Palette helpers ──────────────────────────────────────────────────────────

type RGB = [number, number, number];

function buildPalette(mode: PaletteMode): RGB[] {
  switch (mode) {
    case 'bw':
      return [[0, 0, 0], [255, 255, 255]];
    case 'grayscale-4': {
      const steps = 4;
      return Array.from({ length: steps }, (_, i) => {
        const v = Math.round((i / (steps - 1)) * 255);
        return [v, v, v] as RGB;
      });
    }
    case 'grayscale-8': {
      const steps = 8;
      return Array.from({ length: steps }, (_, i) => {
        const v = Math.round((i / (steps - 1)) * 255);
        return [v, v, v] as RGB;
      });
    }
    case 'color-web': {
      const palette: RGB[] = [];
      for (let r = 0; r <= 255; r += 51)
        for (let g = 0; g <= 255; g += 51)
          for (let b = 0; b <= 255; b += 51)
            palette.push([r, g, b]);
      return palette;
    }
  }
}

function findClosestColor(r: number, g: number, b: number, palette: RGB[]): RGB {
  let best = palette[0];
  let bestDist = Infinity;
  for (const color of palette) {
    const dr = r - color[0];
    const dg = g - color[1];
    const db = b - color[2];
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      best = color;
    }
  }
  return best;
}

/** Convert a single channel (0-255) to the closest value in a 1D sorted list */
function findClosest1D(v: number, values: number[]): number {
  let best = values[0];
  let bestDist = Math.abs(v - values[0]);
  for (const c of values) {
    const d = Math.abs(v - c);
    if (d < bestDist) { bestDist = d; best = c; }
  }
  return best;
}

function paletteChannelValues(mode: PaletteMode): number[] {
  switch (mode) {
    case 'bw': return [0, 255];
    case 'grayscale-4': return [0, 85, 170, 255];
    case 'grayscale-8': return [0, 36, 73, 109, 146, 182, 219, 255];
    case 'color-web': return [0, 51, 102, 153, 204, 255];
  }
}

// ─── Main dither function ─────────────────────────────────────────────────────

export async function ditherImage(
  file: File,
  opts: DitherOptions,
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  onProgress?.(5);

  // 1. Decode the image via ImageBitmap
  const bitmap = await createImageBitmap(file);
  onProgress?.(15);

  const srcW = bitmap.width;
  const srcH = bitmap.height;
  const outW = Math.round(srcW * opts.scale);
  const outH = Math.round(srcH * opts.scale);

  // 2. Draw to offscreen canvas at target scale
  const canvas = new OffscreenCanvas(outW, outH);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, outW, outH);
  bitmap.close();

  const imageData = ctx.getImageData(0, 0, outW, outH);
  const data = imageData.data; // Uint8ClampedArray RGBA
  onProgress?.(25);

  // 3. Apply dithering in place
  const palette = buildPalette(opts.palette);
  const channelVals = paletteChannelValues(opts.palette);
  const isGrayPalette = opts.palette === 'bw' || opts.palette === 'grayscale-4' || opts.palette === 'grayscale-8';

  const totalPixels = outW * outH;

  switch (opts.algorithm) {
    case 'threshold': {
      for (let i = 0; i < totalPixels; i++) {
        const idx = i * 4;
        if (isGrayPalette) {
          const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
          const v = gray >= opts.threshold ? 255 : 0;
          const closest = findClosest1D(v, channelVals);
          data[idx] = data[idx + 1] = data[idx + 2] = closest;
        } else {
          const [cr, cg, cb] = findClosestColor(data[idx], data[idx + 1], data[idx + 2], palette);
          data[idx] = cr; data[idx + 1] = cg; data[idx + 2] = cb;
        }
        if (i % 50000 === 0) onProgress?.(25 + Math.round((i / totalPixels) * 60));
      }
      break;
    }

    case 'random': {
      for (let i = 0; i < totalPixels; i++) {
        const idx = i * 4;
        const noise = (Math.random() - 0.5) * 64;
        if (isGrayPalette) {
          const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
          const v = Math.min(255, Math.max(0, gray + noise));
          const closest = findClosest1D(v, channelVals);
          data[idx] = data[idx + 1] = data[idx + 2] = closest;
        } else {
          const nr = Math.min(255, Math.max(0, data[idx] + noise));
          const ng = Math.min(255, Math.max(0, data[idx + 1] + noise));
          const nb = Math.min(255, Math.max(0, data[idx + 2] + noise));
          const [cr, cg, cb] = findClosestColor(nr, ng, nb, palette);
          data[idx] = cr; data[idx + 1] = cg; data[idx + 2] = cb;
        }
        if (i % 50000 === 0) onProgress?.(25 + Math.round((i / totalPixels) * 60));
      }
      break;
    }

    case 'ordered-2x2':
    case 'ordered-4x4':
    case 'ordered-8x8': {
      const matrix = opts.algorithm === 'ordered-2x2' ? BAYER_2
        : opts.algorithm === 'ordered-4x4' ? BAYER_4 : BAYER_8;
      const n = matrix.length;
      const n2 = n * n;

      for (let y = 0; y < outH; y++) {
        for (let x = 0; x < outW; x++) {
          const idx = (y * outW + x) * 4;
          const threshold = (matrix[y % n][x % n] / n2 - 0.5) * 255;

          if (isGrayPalette) {
            const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
            const v = Math.min(255, Math.max(0, gray + threshold));
            const closest = findClosest1D(v, channelVals);
            data[idx] = data[idx + 1] = data[idx + 2] = closest;
          } else {
            const nr = Math.min(255, Math.max(0, data[idx] + threshold));
            const ng = Math.min(255, Math.max(0, data[idx + 1] + threshold));
            const nb = Math.min(255, Math.max(0, data[idx + 2] + threshold));
            const [cr, cg, cb] = findClosestColor(nr, ng, nb, palette);
            data[idx] = cr; data[idx + 1] = cg; data[idx + 2] = cb;
          }
        }
        if (y % 100 === 0) onProgress?.(25 + Math.round((y / outH) * 60));
      }
      break;
    }

    case 'floyd-steinberg': {
      // Work on float32 buffers for error accumulation
      const buf = new Float32Array(outW * outH * 3);
      for (let i = 0; i < totalPixels; i++) {
        const idx = i * 4;
        if (isGrayPalette) {
          const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
          buf[i * 3] = buf[i * 3 + 1] = buf[i * 3 + 2] = gray;
        } else {
          buf[i * 3] = data[idx];
          buf[i * 3 + 1] = data[idx + 1];
          buf[i * 3 + 2] = data[idx + 2];
        }
      }

      for (let y = 0; y < outH; y++) {
        for (let x = 0; x < outW; x++) {
          const i = y * outW + x;
          const r = Math.min(255, Math.max(0, buf[i * 3]));
          const g = Math.min(255, Math.max(0, buf[i * 3 + 1]));
          const b = Math.min(255, Math.max(0, buf[i * 3 + 2]));

          const [cr, cg, cb] = isGrayPalette
            ? (() => { const v = findClosest1D(r, channelVals); return [v, v, v] as RGB; })()
            : findClosestColor(r, g, b, palette);

          const er = r - cr, eg = g - cg, eb = b - cb;

          // right (7/16)
          if (x + 1 < outW) {
            const j = i + 1;
            buf[j * 3] += er * 7 / 16;
            buf[j * 3 + 1] += eg * 7 / 16;
            buf[j * 3 + 2] += eb * 7 / 16;
          }
          // bottom-left (3/16)
          if (y + 1 < outH && x - 1 >= 0) {
            const j = (y + 1) * outW + (x - 1);
            buf[j * 3] += er * 3 / 16;
            buf[j * 3 + 1] += eg * 3 / 16;
            buf[j * 3 + 2] += eb * 3 / 16;
          }
          // bottom (5/16)
          if (y + 1 < outH) {
            const j = (y + 1) * outW + x;
            buf[j * 3] += er * 5 / 16;
            buf[j * 3 + 1] += eg * 5 / 16;
            buf[j * 3 + 2] += eb * 5 / 16;
          }
          // bottom-right (1/16)
          if (y + 1 < outH && x + 1 < outW) {
            const j = (y + 1) * outW + (x + 1);
            buf[j * 3] += er * 1 / 16;
            buf[j * 3 + 1] += eg * 1 / 16;
            buf[j * 3 + 2] += eb * 1 / 16;
          }

          const idx = i * 4;
          data[idx] = cr; data[idx + 1] = cg; data[idx + 2] = cb;
        }
        if (y % 100 === 0) onProgress?.(25 + Math.round((y / outH) * 60));
      }
      break;
    }

    case 'atkinson': {
      const buf = new Float32Array(outW * outH * 3);
      for (let i = 0; i < totalPixels; i++) {
        const idx = i * 4;
        if (isGrayPalette) {
          const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
          buf[i * 3] = buf[i * 3 + 1] = buf[i * 3 + 2] = gray;
        } else {
          buf[i * 3] = data[idx];
          buf[i * 3 + 1] = data[idx + 1];
          buf[i * 3 + 2] = data[idx + 2];
        }
      }

      // Atkinson distributes 6/8 (i.e. 6 * 1/8) of error to 6 neighbors
      const neighbors = (x: number, y: number): Array<[number, number]> => [
        [x + 1, y],
        [x + 2, y],
        [x - 1, y + 1],
        [x, y + 1],
        [x + 1, y + 1],
        [x, y + 2],
      ];

      for (let y = 0; y < outH; y++) {
        for (let x = 0; x < outW; x++) {
          const i = y * outW + x;
          const r = Math.min(255, Math.max(0, buf[i * 3]));
          const g = Math.min(255, Math.max(0, buf[i * 3 + 1]));
          const b = Math.min(255, Math.max(0, buf[i * 3 + 2]));

          const [cr, cg, cb] = isGrayPalette
            ? (() => { const v = findClosest1D(r, channelVals); return [v, v, v] as RGB; })()
            : findClosestColor(r, g, b, palette);

          const er = (r - cr) / 8;
          const eg = (g - cg) / 8;
          const eb = (b - cb) / 8;

          for (const [nx, ny] of neighbors(x, y)) {
            if (nx >= 0 && nx < outW && ny >= 0 && ny < outH) {
              const j = ny * outW + nx;
              buf[j * 3] += er;
              buf[j * 3 + 1] += eg;
              buf[j * 3 + 2] += eb;
            }
          }

          const idx = i * 4;
          data[idx] = cr; data[idx + 1] = cg; data[idx + 2] = cb;
        }
        if (y % 100 === 0) onProgress?.(25 + Math.round((y / outH) * 60));
      }
      break;
    }
  }

  onProgress?.(90);
  ctx.putImageData(imageData, 0, 0);

  const blob = await canvas.convertToBlob({ type: 'image/png' });
  onProgress?.(100);
  return blob;
}
