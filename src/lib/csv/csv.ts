import Papa from 'papaparse';
import type { OutputFile } from '@/components/shared/OutputFiles';
import { formatFileSize } from '@/lib/utils/fileUtils';

/** A rectangular table of cell strings — row-major. */
export type Grid = string[][];

export type Delimiter = ',' | ';' | '\t' | '|';
export type LineEnding = '\r\n' | '\n';

export interface CsvOptions {
  delimiter: Delimiter;
  /** Quote every field, not just the ones that need it */
  quoteAll: boolean;
  lineEnding: LineEnding;
  /** Prepend a UTF-8 BOM so Excel opens non-ASCII text correctly */
  bom: boolean;
}

export const DEFAULT_CSV_OPTIONS: CsvOptions = {
  delimiter: ',',
  quoteAll: false,
  lineEnding: '\r\n',
  bom: false,
};

export const DELIMITERS: { value: Delimiter; label: string }[] = [
  { value: ',', label: 'Comma (,)' },
  { value: ';', label: 'Semicolon (;)' },
  { value: '\t', label: 'Tab' },
  { value: '|', label: 'Pipe (|)' },
];

/**
 * Length of the longest row (at least `min`). A loop, not `Math.max(...rows)` —
 * spreading 100k+ rows into call arguments overflows the stack.
 */
export function maxRowLength(rows: readonly { length: number }[], min = 0): number {
  let width = min;
  for (const r of rows) if (r.length > width) width = r.length;
  return width;
}

/** Pad every row to the widest row (and at least `minCols`) so the grid is rectangular. */
export function normalizeGrid(rows: Grid, minCols = 1): Grid {
  const width = maxRowLength(rows, minCols);
  return rows.map(r => (r.length === width ? r : [...r, ...Array(width - r.length).fill('')]));
}

export function emptyGrid(rows: number, cols: number): Grid {
  return Array.from({ length: rows }, () => Array(cols).fill(''));
}

/** Drop trailing rows and columns that are entirely empty. Keeps at least one cell. */
export function trimGrid(rows: Grid): Grid {
  let lastRow = rows.length - 1;
  while (lastRow > 0 && rows[lastRow].every(c => c === '')) lastRow--;
  const kept = rows.slice(0, lastRow + 1);
  let lastCol = maxRowLength(kept) - 1;
  while (lastCol > 0 && kept.every(r => (r[lastCol] ?? '') === '')) lastCol--;
  return normalizeGrid(kept.map(r => r.slice(0, lastCol + 1)));
}

/** Parse CSV text, auto-detecting the delimiter. */
export function parseCsv(text: string): { rows: Grid; delimiter: Delimiter } {
  const input = text.replace(/^\uFEFF/, '');
  const result = Papa.parse<string[]>(input, { skipEmptyLines: true });
  const detected = result.meta.delimiter as Delimiter;
  const delimiter = DELIMITERS.some(d => d.value === detected) ? detected : ',';
  const rows = result.data.length > 0 ? normalizeGrid(result.data) : emptyGrid(1, 1);
  return { rows, delimiter };
}

/**
 * Parse clipboard text copied from Excel / Google Sheets (tab-separated,
 * with quoted multi-line cells). Plain text with no tabs or newlines becomes
 * a single cell.
 */
export function parseClipboardTable(text: string): Grid {
  const input = text.replace(/\r?\n$/, '');
  if (!/[\t\n]/.test(input)) return [[input]];
  const result = Papa.parse<string[]>(input, { delimiter: '\t' });
  return normalizeGrid(result.data);
}

function escapeField(value: string, opts: CsvOptions): string {
  const needsQuotes = opts.quoteAll || value.includes(opts.delimiter) || /["\r\n]/.test(value);
  return needsQuotes ? `"${value.replace(/"/g, '""')}"` : value;
}

export function serializeCsv(rows: Grid, opts: CsvOptions = DEFAULT_CSV_OPTIONS): string {
  return rows
    .map(r => r.map(v => escapeField(v, opts)).join(opts.delimiter))
    .join(opts.lineEnding);
}

export function csvBlob(text: string, bom: boolean): Blob {
  return new Blob([bom ? '\uFEFF' + text : text], { type: 'text/csv;charset=utf-8' });
}

export const MAX_CSV_BYTES = 50 * 1024 * 1024;

/** Read and parse a CSV/TSV file, rejecting empty and oversized files with a user-facing message. */
export async function readCsvFile(file: File, maxBytes = MAX_CSV_BYTES): Promise<{ rows: Grid; delimiter: Delimiter }> {
  if (file.size > maxBytes) {
    throw new Error(`File is ${formatFileSize(file.size)} — the limit is ${formatFileSize(maxBytes)}.`);
  }
  const text = await file.text();
  if (text.trim() === '') throw new Error('That file is empty.');
  return parseCsv(text);
}

/** Serialize rows into a downloadable `.csv` OutputFile. */
export function csvOutputFile(name: string, rows: Grid, opts: CsvOptions): OutputFile {
  const blob = csvBlob(serializeCsv(rows, opts), opts.bom);
  return { name: name.endsWith('.csv') ? name : `${name}.csv`, blob, size: blob.size };
}

/** Display names for each column: the header cell, or the column letter when the header is blank. */
export function headerNames(rows: Grid): string[] {
  return (rows[0] ?? []).map((h, i) => h.trim() || `Column ${columnLabel(i)}`);
}

/** Write `block` into `grid` with its top-left at (row, col), growing the grid as needed. */
export function pasteIntoGrid(grid: Grid, block: Grid, row: number, col: number): Grid {
  const height = Math.max(grid.length, row + block.length);
  const width = Math.max(grid[0]?.length ?? 0, col + maxRowLength(block));
  const next = normalizeGrid(
    Array.from({ length: height }, (_, i) => [...(grid[i] ?? [])]),
    width,
  );
  block.forEach((r, i) => r.forEach((v, j) => { next[row + i][col + j] = v; }));
  return next;
}

export function insertRow(grid: Grid, at: number): Grid {
  const width = grid[0]?.length ?? 1;
  return [...grid.slice(0, at), Array(width).fill(''), ...grid.slice(at)];
}

export function deleteRow(grid: Grid, at: number): Grid {
  if (grid.length <= 1) return emptyGrid(1, grid[0]?.length ?? 1);
  return grid.filter((_, i) => i !== at);
}

export function insertCol(grid: Grid, at: number): Grid {
  return grid.map(r => [...r.slice(0, at), '', ...r.slice(at)]);
}

export function deleteCol(grid: Grid, at: number): Grid {
  if ((grid[0]?.length ?? 0) <= 1) return grid.map(() => ['']);
  return grid.map(r => r.filter((_, j) => j !== at));
}

function swap<T>(arr: T[], a: number, b: number): T[] {
  if (a < 0 || b < 0 || a >= arr.length || b >= arr.length) return arr;
  const next = [...arr];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

export function moveRow(grid: Grid, from: number, to: number): Grid {
  return swap(grid, from, to);
}

export function moveCol(grid: Grid, from: number, to: number): Grid {
  const width = grid[0]?.length ?? 0;
  if (from < 0 || to < 0 || from >= width || to >= width) return grid;
  return grid.map(r => swap(r, from, to));
}

/** Spreadsheet-style column label: 0 → A, 25 → Z, 26 → AA */
export function columnLabel(index: number): string {
  let n = index + 1;
  let label = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}
