import scribe from 'scribe.js-ocr';

export interface OcrWordResult {
  text: string;
  bbox: { left: number; top: number; right: number; bottom: number };
  conf: number;
  /** Baseline y in image pixels — line.bbox.bottom + line.baseline[1] */
  baseline: number;
  fontFamily: string | null;
  bold: boolean;
  italic: boolean;
}

export interface OcrPageResult {
  words: OcrWordResult[];
  dims: { width: number; height: number };
}

export interface OCRResult {
  text: string;
  pages: number;
  pageData: OcrPageResult[];
}

export async function runOCR(
  file: File,
  lang = 'eng',
  onProgress?: (pct: number) => void
): Promise<OCRResult> {
  onProgress?.(5);
  const doc = await scribe.openDocument([file]);


  onProgress?.(20);
  await doc.recognize({ langs: [lang], mode: 'quality' });

  onProgress?.(90);
  const text = await doc.exportData('txt') as string;
  const pages = doc.inputData.pageCount ?? 1;

  // Extract per-page word bboxes
  const pageData: OcrPageResult[] = (doc.ocr.active ?? []).map((page: any) => {
    const words: OcrWordResult[] = [];
    for (const line of (page.lines ?? [])) {
      const baseline: number = (line.bbox?.bottom ?? 0) + (line.baseline?.[1] ?? 0);
      for (const word of (line.words ?? [])) {
        if (word.text?.trim()) {
          words.push({
            text: word.text,
            bbox: word.bbox,
            conf: word.conf ?? 0,
            baseline,
            fontFamily: word.style?.font ?? null,
            bold: word.style?.bold ?? false,
            italic: word.style?.italic ?? false,
          });
        }
      }
    }
    return {
      words,
      dims: page.dims ?? { width: 0, height: 0 },
    };
  });

  await doc.clear();
  onProgress?.(100);

  return { text: text.trim(), pages, pageData };
}
