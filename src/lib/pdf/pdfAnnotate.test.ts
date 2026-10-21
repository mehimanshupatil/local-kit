import { describe, expect, it } from 'vitest';
import { annotationPxPerPoint, changedPage, ANNOTATION_PX_PER_POINT, MAX_ANNOTATION_PX } from './pdfAnnotate';

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

describe('changedPage', () => {
  const p1 = ['a'], p2 = ['b'];

  it('finds the page whose list was replaced', () => {
    expect(changedPage({ 1: p1, 2: p2 }, { 1: p1, 2: ['b', 'c'] })).toBe(2);
  });

  it('finds pages added or removed between snapshots', () => {
    expect(changedPage({ 1: p1 }, { 1: p1, 3: p2 })).toBe(3);
    expect(changedPage({ 1: p1, 3: p2 }, { 1: p1 })).toBe(3);
  });

  it('returns undefined when nothing changed', () => {
    expect(changedPage({ 1: p1 }, { 1: p1 })).toBeUndefined();
  });
});
