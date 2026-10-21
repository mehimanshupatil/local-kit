import { describe, expect, it } from 'vitest';
import { measureWatermark, watermarkPlacement, watermarkPlacements } from './pdfWatermark';

const A4 = { width: 595, height: 842 };
const TEXT = { width: 300, height: 40 };

/** Where the text box's centre ends up after pdf-lib rotates it about the origin */
function rotatedCentre(origin: { x: number; y: number }, rotationDeg: number) {
  const rad = (rotationDeg * Math.PI) / 180;
  const cx = TEXT.width / 2, cy = TEXT.height / 2;
  return { x: origin.x + cx * Math.cos(rad) - cy * Math.sin(rad), y: origin.y + cx * Math.sin(rad) + cy * Math.cos(rad) };
}

describe('watermarkPlacement', () => {
  it.each([0, 45, 90, -30, 180])('centres the text on the page at %i°', (deg) => {
    const centre = rotatedCentre(watermarkPlacement(A4, TEXT, deg), deg);
    expect(centre.x).toBeCloseTo(A4.width / 2);
    expect(centre.y).toBeCloseTo(A4.height / 2);
  });

  it('is plain centring when unrotated', () => {
    expect(watermarkPlacement(A4, TEXT, 0)).toEqual({ x: (595 - 300) / 2, y: (842 - 40) / 2 });
  });
});

describe('measureWatermark', () => {
  it('scales linearly with font size', () => {
    const a = measureWatermark('CONFIDENTIAL', 30), b = measureWatermark('CONFIDENTIAL', 60);
    expect(b.width).toBeCloseTo(a.width * 2);
    expect(b.height).toBeCloseTo(a.height * 2);
    expect(a.width).toBeGreaterThan(0);
  });
});

describe('watermarkPlacements', () => {
  const centres = (origins: { x: number; y: number }[], deg: number) => origins.map(o => rotatedCentre(o, deg));

  it('returns the single centred copy when not repeating', () => {
    expect(watermarkPlacements(A4, TEXT, 45)).toEqual([watermarkPlacement(A4, TEXT, 45)]);
  });

  it.each([0, 45, 90])('keeps a copy on the page centre at %i°', (deg) => {
    const cs = centres(watermarkPlacements(A4, TEXT, deg, { gap: 60 }), deg);
    expect(cs.some(c => Math.abs(c.x - A4.width / 2) < 1e-6 && Math.abs(c.y - A4.height / 2) < 1e-6)).toBe(true);
  });

  it.each([0, 45, 90])('covers all four corners at %i°', (deg) => {
    const gap = 60;
    const cs = centres(watermarkPlacements(A4, TEXT, deg, { gap }), deg);
    // Any point is within one grid cell's diagonal of some copy's centre when the grid covers it
    const cell = Math.hypot(TEXT.width + gap, TEXT.height + gap);
    for (const corner of [{ x: 0, y: 0 }, { x: A4.width, y: 0 }, { x: 0, y: A4.height }, { x: A4.width, y: A4.height }]) {
      const nearest = Math.min(...cs.map(c => Math.hypot(c.x - corner.x, c.y - corner.y)));
      expect(nearest).toBeLessThanOrEqual(cell);
    }
  });

  it('drops copies that cannot reach the page', () => {
    const halfText = Math.hypot(TEXT.width, TEXT.height) / 2;
    for (const c of centres(watermarkPlacements(A4, TEXT, 45, { gap: 60 }), 45)) {
      expect(c.x).toBeGreaterThanOrEqual(-halfText - 1e-6);
      expect(c.x).toBeLessThanOrEqual(A4.width + halfText + 1e-6);
      expect(c.y).toBeGreaterThanOrEqual(-halfText - 1e-6);
      expect(c.y).toBeLessThanOrEqual(A4.height + halfText + 1e-6);
    }
  });

  it('places fewer copies as the gap grows', () => {
    const tight = watermarkPlacements(A4, TEXT, 45, { gap: 20 }).length;
    const loose = watermarkPlacements(A4, TEXT, 45, { gap: 200 }).length;
    expect(tight).toBeGreaterThan(loose);
    expect(loose).toBeGreaterThan(1);
  });
});
