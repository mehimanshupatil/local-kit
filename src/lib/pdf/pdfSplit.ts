import { PDFDocument } from '@cantoo/pdf-lib';
import { stripExtension } from '@/lib/utils/fileUtils';

export type SplitMode = 'each' | 'range' | 'every-n';

export interface SplitConfig {
  mode: SplitMode;
  ranges?: string; // e.g. "1-3,5,7-9"
  n?: number;      // split every n pages
}

export async function splitPDF(
  buffer: ArrayBuffer,
  filename: string,
  config: SplitConfig,
  onProgress?: (pct: number) => void
): Promise<{ name: string; blob: Blob }[]> {
  const source = await PDFDocument.load(buffer);
  const total = source.getPageCount();
  const base = stripExtension(filename);
  const results: { name: string; blob: Blob }[] = [];

  const groups: number[][] = [];

  if (config.mode === 'each') {
    for (let i = 0; i < total; i++) groups.push([i]);
  } else if (config.mode === 'every-n') {
    const n = config.n ?? 1;
    for (let i = 0; i < total; i += n) {
      groups.push(Array.from({ length: Math.min(n, total - i) }, (_, j) => i + j));
    }
  } else if (config.mode === 'range') {
    const ranges = parseRanges(config.ranges ?? '', total);
    groups.push(...ranges);
  }

  for (let g = 0; g < groups.length; g++) {
    const doc = await PDFDocument.create();
    const pages = await doc.copyPages(source, groups[g]);
    pages.forEach(p => doc.addPage(p));
    const bytes = await doc.save();
    results.push({
      name: groups.length === 1 ? `${base}_split.pdf` : `${base}_part${g + 1}.pdf`,
      blob: new Blob([bytes], { type: 'application/pdf' }),
    });
    onProgress?.(Math.round(((g + 1) / groups.length) * 100));
  }

  return results;
}

function parseRanges(raw: string, total: number): number[][] {
  return raw.split(',').map(part => {
    part = part.trim();
    if (part.includes('-')) {
      const [a, b] = part.split('-').map(n => parseInt(n.trim()) - 1);
      return Array.from({ length: b - a + 1 }, (_, i) => Math.min(Math.max(a + i, 0), total - 1));
    }
    return [Math.min(Math.max(parseInt(part) - 1, 0), total - 1)];
  }).filter(g => g.length > 0);
}
