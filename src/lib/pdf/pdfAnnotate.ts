import { loadPDFDocument } from './pdfLoader';
import { PDFDocument, rgb } from '@cantoo/pdf-lib';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

export interface PageDimensions { width: number; height: number; }

/** Render a PDF page to a canvas element. Returns scale factor (display/natural). */
export async function renderPageToCanvas(
  pdf: PDFDocumentProxy,
  pageNum: number,
  canvas: HTMLCanvasElement,
  maxWidth = 900,
): Promise<{ scale: number; dims: PageDimensions }> {
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1 });
  const scale = Math.min(maxWidth / viewport.width, 1.5);
  const scaled = page.getViewport({ scale });

  canvas.width  = scaled.width;
  canvas.height = scaled.height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport: scaled }).promise;

  return {
    scale,
    dims: { width: viewport.width, height: viewport.height },
  };
}

/** Export a Konva stage / canvas as a transparent PNG data URL */
export function stageToDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png');
}

/**
 * Embed annotation PNG onto a specific page of the PDF.
 * annotationDataUrl: transparent PNG from the Konva canvas
 * scale: display scale used when rendering (to convert display coords → PDF coords)
 */
export async function embedAnnotationOnPage(
  pdfBuffer: ArrayBuffer,
  pageIndex: number,
  annotationDataUrl: string,
  displayScale: number,
): Promise<Blob> {
  // slice(0) to prevent "detached ArrayBuffer" — pdfjs may have already transferred the original
  const doc = await PDFDocument.load(pdfBuffer.slice(0), { ignoreEncryption: true });
  const page = doc.getPages()[pageIndex];
  const { width: pdfW, height: pdfH } = page.getSize();

  // Fetch PNG bytes from data URL
  const res = await fetch(annotationDataUrl);
  const pngBytes = new Uint8Array(await res.arrayBuffer());
  const pngImage = await doc.embedPng(pngBytes);

  // Draw annotation covering the full page (transparent areas show through)
  page.drawImage(pngImage, {
    x: 0,
    y: 0,
    width: pdfW,
    height: pdfH,
  });

  const bytes = await doc.save();
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
}
