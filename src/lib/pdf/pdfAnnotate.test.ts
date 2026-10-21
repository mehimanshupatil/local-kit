import { describe, expect, it } from 'vitest';
import { annotationPxPerPoint, ANNOTATION_PX_PER_POINT, MAX_ANNOTATION_PX } from './pdfAnnotate';

describe('annotationPxPerPoint', () => {
  it('rasterises ordinary pages well above 72 DPI', () => {
    expect(annotationPxPerPoint({ width: 595, height: 842 })).toBe(ANNOTATION_PX_PER_POINT); // A4
    expect(annotationPxPerPoint({ width: 612, height: 792 })).toBe(ANNOTATION_PX_PER_POINT); // Letter
  });

  it('caps the raster size on very large pages', () => {
    const a0 = { width: 2384, height: 3370 };
    expect(Math.round(annotationPxPerPoint(a0) * a0.height)).toBe(MAX_ANNOTATION_PX);
  });

  it('never drops below 1 px per point', () => {
    expect(annotationPxPerPoint({ width: 10_000, height: 14_400 })).toBe(1);
  });
});
