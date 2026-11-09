import { columnLabel, maxRowLength, normalizeGrid, type Grid } from './csv';

/** One entry in the column editor list: which source column, whether to keep it, and its output name. */
export interface ColumnSpec {
  /** Index into the source grid's columns */
  source: number;
  keep: boolean;
  /** Output header name (only used when the grid has a header row) */
  name: string;
}

/** A spec per column in source order — all kept, names taken from the header row (or blank without one). */
export function initialColumnSpecs(rows: Grid, header: boolean): ColumnSpec[] {
  const width = rows[0]?.length ?? 0;
  return Array.from({ length: width }, (_, i) => ({
    source: i,
    keep: true,
    name: header ? rows[0][i] ?? '' : '',
  }));
}

/** Display label for a column in pickers: the header name, or "Column A" without one / when blank. */
export function columnDisplayName(rows: Grid, index: number, header: boolean): string {
  const name = header ? (rows[0]?.[index] ?? '').trim() : '';
  return name || `Column ${columnLabel(index)}`;
}

/** Reorder, drop and rename columns. With a header, the first row takes the spec names. */
export function applyColumnSpecs(rows: Grid, specs: ColumnSpec[], header: boolean): Grid {
  const kept = specs.filter(s => s.keep);
  return rows.map((row, r) =>
    kept.map(s => (header && r === 0 ? s.name : row[s.source] ?? '')));
}

export interface SplitOptions {
  column: number;
  separator: string;
  /** Keep the original column alongside the new parts */
  keepOriginal: boolean;
  header: boolean;
}

/**
 * Split one column on a literal separator into `<name> 1..n` columns, where n is the
 * largest number of parts in any data row. New columns go right after the original
 * (or replace it). Parts are not trimmed. An empty separator returns the grid unchanged.
 */
export function splitColumn(rows: Grid, opts: SplitOptions): Grid {
  const { column, separator, keepOriginal, header } = opts;
  if (!separator || rows.length === 0 || column < 0 || column >= (rows[0]?.length ?? 0)) return rows;

  const body = header ? rows.slice(1) : rows;
  const parts = body.map(r => (r[column] ?? '') === '' ? [] : (r[column] ?? '').split(separator));
  const count = maxRowLength(parts, 1);
  const baseName = header ? (rows[0][column] ?? '').trim() || `Column ${columnLabel(column)}` : '';

  return normalizeGrid(rows.map((row, r) => {
    const isHeader = header && r === 0;
    const pieces = isHeader
      ? Array.from({ length: count }, (_, i) => `${baseName} ${i + 1}`)
      : Array.from({ length: count }, (_, i) => parts[header ? r - 1 : r][i] ?? '');
    const before = row.slice(0, column + (keepOriginal ? 1 : 0));
    const after = row.slice(column + 1);
    return [...before, ...pieces, ...after];
  }));
}

export interface JoinOptions {
  /** Columns to join, in the order their values should appear (2+) */
  columns: number[];
  separator: string;
  /** Header name for the new column */
  name: string;
  /** Keep the joined columns alongside the new one */
  keepOriginals: boolean;
  /** Leave empty values out instead of producing doubled separators */
  skipEmpty: boolean;
  header: boolean;
}

/**
 * Join 2+ columns into one. The new column takes the position of the left-most joined
 * column when originals are removed, or goes right after the right-most one when kept.
 */
export function joinColumns(rows: Grid, opts: JoinOptions): Grid {
  const width = rows[0]?.length ?? 0;
  const columns = opts.columns.filter(c => c >= 0 && c < width);
  if (columns.length < 2) return rows;

  const chosen = new Set(columns);
  const insertAfter = opts.keepOriginals ? Math.max(...columns) : Math.min(...columns);

  return rows.map((row, r) => {
    const isHeader = opts.header && r === 0;
    const values = columns.map(c => row[c] ?? '');
    const joined = isHeader
      ? opts.name
      : (opts.skipEmpty ? values.filter(v => v !== '') : values).join(opts.separator);
    const out: string[] = [];
    row.forEach((v, c) => {
      if (opts.keepOriginals || !chosen.has(c)) out.push(v);
      if (c === insertAfter) out.push(joined);
    });
    return out;
  });
}
