import Papa from 'papaparse';
import { formatFileSize } from '@/lib/utils/fileUtils';
import { DELIMITERS, type Delimiter, type Grid } from './csv';

/**
 * Stack-safe variant of `parseCsv` / `readCsvFile` for big files.
 * `normalizeGrid` in csv.ts spreads every row length into `Math.max(...)`,
 * which overflows the call stack at ~100k+ rows; this pads with a plain loop.
 */

/** Pad rows in place to the widest row (at least 1 column). */
export function padGridInPlace(rows: Grid): Grid {
  let width = 1;
  for (const r of rows) if (r.length > width) width = r.length;
  for (const r of rows) while (r.length < width) r.push('');
  return rows;
}

export function parseLargeCsv(text: string): { rows: Grid; delimiter: Delimiter } {
  const input = text.replace(/^\uFEFF/, '');
  const result = Papa.parse<string[]>(input, { skipEmptyLines: true });
  const detected = result.meta.delimiter as Delimiter;
  const delimiter = DELIMITERS.some(d => d.value === detected) ? detected : ',';
  const rows = result.data.length > 0 ? padGridInPlace(result.data) : [['']];
  return { rows, delimiter };
}

/** Read and parse a CSV/TSV file, rejecting empty and oversized files with a user-facing message. */
export async function readLargeCsvFile(file: File, maxBytes: number): Promise<{ rows: Grid; delimiter: Delimiter }> {
  if (file.size > maxBytes) {
    throw new Error(`File is ${formatFileSize(file.size)} — the limit is ${formatFileSize(maxBytes)}.`);
  }
  const text = await file.text();
  if (text.trim() === '') throw new Error('That file is empty.');
  return parseLargeCsv(text);
}
