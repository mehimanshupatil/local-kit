export interface ExtractedImage {
  name: string;
  blob: Blob;
  width: number;
  height: number;
  page: number;
}

export async function extractImagesFromPDF(
  buffer: ArrayBuffer,
  onProgress?: (pct: number) => void
): Promise<ExtractedImage[]> {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/workers/pdf.worker.min.mjs';

  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const results: ExtractedImage[] = [];
  let imgIndex = 0;

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d')!;

    const captured: (HTMLCanvasElement | ImageBitmap)[] = [];
    const origDrawImage = ctx.drawImage.bind(ctx);

    // @ts-ignore — intercept drawImage to capture image sources
    ctx.drawImage = function (src: CanvasImageSource, ...args: unknown[]) {
      const w = (src as any).width as number;
      const h = (src as any).height as number;
      if ((src instanceof HTMLCanvasElement || src instanceof ImageBitmap) && w > 32 && h > 32) {
        captured.push(src as HTMLCanvasElement | ImageBitmap);
      }
      // @ts-ignore
      return origDrawImage(src, ...args);
    };

    await page.render({ canvasContext: ctx as any, viewport }).promise;

    // Deduplicate by dimensions
    const seen = new Set<string>();
    for (const src of captured) {
      const key = `${src.width}x${src.height}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const imgCanvas = document.createElement('canvas');
      imgCanvas.width = src.width;
      imgCanvas.height = src.height;
      imgCanvas.getContext('2d')!.drawImage(src as CanvasImageSource, 0, 0);

      const blob = await new Promise<Blob>((res, rej) =>
        imgCanvas.toBlob(b => b ? res(b) : rej(new Error('toBlob failed')), 'image/png')
      );
      imgIndex++;
      results.push({ name: `image_p${pageNum}_${imgIndex}.png`, blob, width: src.width, height: src.height, page: pageNum });
    }

    onProgress?.(Math.round((pageNum / pdf.numPages) * 100));
  }

  return results;
}
