import type { Grid } from './csv';

export interface MergeInput {
  name: string;
  rows: Grid;
}

export type ColumnMatch = 'name' | 'position';

export interface MergeOptions {
  /** Align columns by header text or by column position. Header-less input always merges by position. */
  match: ColumnMatch;
  hasHeader: boolean;
  /** Append a `source_file` column holding each row's input file name */
  addSource: boolean;
  /** Drop rows identical (ignoring `source_file`) to an earlier row, across all files */
  dedupe: boolean;
}

export const DEFAULT_MERGE_OPTIONS: MergeOptions = {
  match: 'name',
  hasHeader: true,
  addSource: false,
  dedupe: false,
};

export interface MergeResult {
  rows: Grid;
  /** Number of data rows (excluding any header) */
  dataRows: number;
  columns: number;
  duplicatesRemoved: number;
}

export const SOURCE_COLUMN = 'source_file';

/**
 * Comparable keys for a header row: trimmed and case-folded. Repeated headers
 * get an occurrence suffix (`name`, `name#2`) so the second `name` column of
 * one file lines up with the second `name` column of another; blank headers are
 * keyed by position since they have nothing else to match on.
 */
export function headerKeys(header: string[]): string[] {
  const seen = new Map<string, number>();
  return header.map((h, i) => {
    const base = h.trim().toLowerCase();
    if (base === '') return `\u0000blank:${i}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}#${n}`;
  });
}

const width = (rows: Grid) => Math.max(0, ...rows.map(r => r.length));

/** Merge several parsed CSVs into one grid. */
export function mergeCsvs(inputs: MergeInput[], options: MergeOptions): MergeResult {
  const { hasHeader, addSource, dedupe } = options;
  const match: ColumnMatch = hasHeader ? options.match : 'position';

  let header: string[] = [];
  /** Per input: for each output column, the source column index (or -1 when absent) */
  let mappings: number[][];

  if (match === 'name') {
    const keyIndex = new Map<string, number>();
    mappings = inputs.map(({ rows }) => {
      const fileHeader = rows[0] ?? [];
      const keys = headerKeys(fileHeader);
      const toOutput = keys.map((key, i) => {
        let col = keyIndex.get(key);
        if (col === undefined) {
          col = header.length;
          keyIndex.set(key, col);
          header.push(fileHeader[i].trim());
        }
        return col;
      });
      return toOutput;
    });
    // Invert: output column → source column
    mappings = mappings.map(toOutput => {
      const fromOutput = Array<number>(header.length).fill(-1);
      toOutput.forEach((out, src) => { fromOutput[out] = src; });
      return fromOutput;
    });
  } else {
    const cols = Math.max(0, ...inputs.map(i => width(i.rows)));
    if (hasHeader) {
      header = Array.from({ length: cols }, (_, c) =>
        inputs.map(i => i.rows[0]?.[c] ?? '').find(h => h.trim() !== '')?.trim() ?? '');
    }
    mappings = inputs.map(() => Array.from({ length: cols }, (_, c) => c));
  }

  const out: Grid = [];
  const seen = new Set<string>();
  let duplicatesRemoved = 0;

  inputs.forEach(({ name, rows }, f) => {
    const map = mappings[f];
    for (const row of hasHeader ? rows.slice(1) : rows) {
      const cells = map.map(src => (src < 0 ? '' : row[src] ?? ''));
      if (dedupe) {
        const key = JSON.stringify(cells);
        if (seen.has(key)) { duplicatesRemoved++; continue; }
        seen.add(key);
      }
      out.push(addSource ? [...cells, name] : cells);
    }
  });

  const columns = (mappings[0]?.length ?? 0) + (addSource ? 1 : 0);
  const rows = hasHeader ? [addSource ? [...header, SOURCE_COLUMN] : header, ...out] : out;
  return { rows, dataRows: out.length, columns, duplicatesRemoved };
}
