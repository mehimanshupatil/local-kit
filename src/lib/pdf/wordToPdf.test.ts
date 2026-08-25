import { describe, expect, it } from 'vitest';
import { chunkByHeight, computeRenderScale } from './wordToPdf';

// Regression coverage for dd3de90 (blank/blurry PDF output on long or
// image-heavy Word docs): a single oversized canvas silently rendered blank,
// and downscaling the whole document to fit blurred text. These two pure
// functions are what keeps each rendered chunk within the browser's canvas
// limits without ever upscaling past the base render scale.

describe('chunkByHeight', () => {
  it('keeps every chunk under the height cap', () => {
    const heights = Array.from({ length: 50 }, () => 30);
    const chunks = chunkByHeight(heights, h => h, 100);
    for (const chunk of chunks) {
      expect(chunk.reduce((sum, h) => sum + h, 0)).toBeLessThanOrEqual(100);
    }
  });

  it('retains every item, in order, across chunks', () => {
    const items = Array.from({ length: 37 }, (_, i) => i);
    const chunks = chunkByHeight(items, () => 15, 50);
    expect(chunks.flat()).toEqual(items);
  });

  it('gives an oversized item its own chunk instead of dropping it', () => {
    const chunks = chunkByHeight([10, 500, 10], h => h, 100);
    expect(chunks).toEqual([[10], [500], [10]]);
  });

  it('returns nothing for an empty input', () => {
    expect(chunkByHeight([], (h: number) => h, 100)).toEqual([]);
  });
});

describe('computeRenderScale', () => {
  it('uses the base scale when content comfortably fits', () => {
    const scale = computeRenderScale(500, 794, 2, 14000, 100_000_000);
    expect(scale).toBe(2);
  });

  it('caps scale so height * scale stays within maxDimension', () => {
    const contentHeight = 10_000;
    const scale = computeRenderScale(contentHeight, 794, 2, 14000, 100_000_000);
    expect(scale).toBeCloseTo(1.4, 5);
    expect(contentHeight * scale).toBeLessThanOrEqual(14000);
  });

  it('caps scale so width*height*scale^2 stays within maxArea', () => {
    const contentWidth = 794;
    const contentHeight = 8000;
    const maxArea = 100_000_000;
    const scale = computeRenderScale(contentHeight, contentWidth, 2, 100_000, maxArea);
    expect(contentWidth * contentHeight * scale * scale).toBeLessThanOrEqual(maxArea + 1e-6);
  });

  it('never upscales past the base scale', () => {
    const scale = computeRenderScale(10, 10, 2, 14000, 100_000_000);
    expect(scale).toBeLessThanOrEqual(2);
  });
});
