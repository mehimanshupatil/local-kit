import type { Grid } from './csv';

/**
 * Pure helpers for the CSV Viewer: numeric-aware sorting, substring search,
 * type inference and per-column statistics. Everything works on row *indices*
 * into the data grid so a 200k-row file is never copied while sorting/filtering.
 */

export type SortDir = 'asc' | 'desc';
export interface SortState { col: number; dir: SortDir }
export type ColumnType = 'number' | 'date' | 'boolean' | 'text';

/** Header click cycles asc → desc → none; clicking a different column starts at asc. */
export function nextSort(current: SortState | null, col: number): SortState | null {
  if (!current || current.col !== col) return { col, dir: 'asc' };
  if (current.dir === 'asc') return { col, dir: 'desc' };
  return null;
}

// Plain numbers with optional sign, comma thousands grouping, decimals and exponent.
const NUMBER_RE = /^[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)?(?:\.\d+)?(?:e[-+]?\d+)?$/i;

/** Parse a cell as a plain number ("1,234.5", "-3", "1e6"); `null` when it isn't one. */
export function parseCellNumber(value: string): number | null {
  const s = value.trim();
  if (s === '' || !/\d/.test(s) || !NUMBER_RE.test(s)) return null;
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/** Parse an ISO-like date ("2024-03-05", "2024-03-05 10:30", "2024-03-05T10:30:00Z") to epoch ms. */
export function parseIsoDate(value: string): number | null {
  const s = value.trim();
  if (!ISO_DATE_RE.test(s)) return null;
  const t = Date.parse(s.replace(' ', 'T'));
  return Number.isNaN(t) ? null : t;
}

const BOOLEANS = new Set(['true', 'false', 'yes', 'no']);

export function isBooleanLike(value: string): boolean {
  return BOOLEANS.has(value.trim().toLowerCase());
}

/**
 * Infer a column's type from its non-empty values: a type is chosen only when
 * *every* non-empty value fits it. Columns with no values are `text`.
 */
export function inferType(values: Iterable<string>): ColumnType {
  let number = true, date = true, bool = true, any = false;
  for (const v of values) {
    if (v.trim() === '') continue;
    any = true;
    if (number && parseCellNumber(v) === null) number = false;
    if (date && parseIsoDate(v) === null) date = false;
    if (bool && !isBooleanLike(v)) bool = false;
    if (!number && !date && !bool) return 'text';
  }
  if (!any) return 'text';
  if (number) return 'number';
  if (date) return 'date';
  if (bool) return 'boolean';
  return 'text';
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/**
 * Indices of `rows` sorted by column `col`. Numbers compare numerically and come
 * before text; text uses a natural, case-insensitive collation; empty cells are
 * always last whichever the direction. The sort is stable (ties keep file order).
 */
export function sortIndices(rows: Grid, sort: SortState | null): number[] {
  const indices = rows.map((_, i) => i);
  if (!sort) return indices;
  const { col, dir } = sort;
  const sign = dir === 'asc' ? 1 : -1;
  // Precompute keys once: 0 = number, 1 = text, 2 = empty.
  const kind = new Uint8Array(rows.length);
  const nums = new Float64Array(rows.length);
  const texts: string[] = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const v = rows[i][col] ?? '';
    if (v.trim() === '') { kind[i] = 2; continue; }
    const n = parseCellNumber(v);
    if (n !== null) { kind[i] = 0; nums[i] = n; }
    else { kind[i] = 1; texts[i] = v; }
  }
  indices.sort((a, b) => {
    const ka = kind[a], kb = kind[b];
    if (ka === 2 || kb === 2) return ka === kb ? 0 : ka === 2 ? 1 : -1;
    if (ka !== kb) return sign * (ka - kb);
    if (ka === 0) return sign * (nums[a] - nums[b]);
    return sign * collator.compare(texts[a], texts[b]);
  });
  return indices;
}

const SEP = '\u0001';

/** One lowercased haystack string per row, so search is a single `includes` per row. */
export function buildSearchIndex(rows: Grid): string[] {
  return rows.map(r => r.join(SEP).toLowerCase());
}

/** Keep the indices whose row contains `query` (case-insensitive substring of any cell). */
export function filterIndices(indices: number[], searchIndex: string[], query: string): number[] {
  const q = query.trim().toLowerCase();
  if (q === '') return indices;
  return indices.filter(i => searchIndex[i].includes(q));
}

export interface ColumnStats {
  count: number;
  nonEmpty: number;
  empty: number;
  unique: number;
  type: ColumnType;
  number?: { min: number; max: number; mean: number; sum: number };
  /** Original cell text of the earliest / latest date */
  date?: { min: string; max: string };
  top: { value: string; count: number }[];
}

/** Statistics for column `col` over the given row indices (all rows when omitted). */
export function columnStats(rows: Grid, col: number, indices?: number[], topN = 5): ColumnStats {
  const idx = indices ?? rows.map((_, i) => i);
  const counts = new Map<string, number>();
  let empty = 0;
  for (const i of idx) {
    const v = rows[i][col] ?? '';
    if (v.trim() === '') { empty++; continue; }
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const type = inferType(counts.keys());
  const stats: ColumnStats = {
    count: idx.length,
    nonEmpty: idx.length - empty,
    empty,
    unique: counts.size,
    type,
    top: topValues(counts, topN),
  };

  if (type === 'number') {
    let min = Infinity, max = -Infinity, sum = 0, n = 0;
    for (const [v, c] of counts) {
      const x = parseCellNumber(v)!;
      if (x < min) min = x;
      if (x > max) max = x;
      sum += x * c;
      n += c;
    }
    stats.number = { min, max, sum, mean: sum / n };
  } else if (type === 'date') {
    let min = '', max = '', minT = Infinity, maxT = -Infinity;
    for (const v of counts.keys()) {
      const t = parseIsoDate(v)!;
      if (t < minT) { minT = t; min = v; }
      if (t > maxT) { maxT = t; max = v; }
    }
    stats.date = { min, max };
  }
  return stats;
}

/** Most frequent values, ties broken by natural value order. */
function topValues(counts: Map<string, number>, n: number): { value: string; count: number }[] {
  return [...counts]
    .sort((a, b) => b[1] - a[1] || collator.compare(a[0], b[0]))
    .slice(0, n)
    .map(([value, count]) => ({ value, count }));
}

/**
 * Pixel width per column from the longest of the header and a sample of rows,
 * clamped so one long cell can't blow out the layout.
 */
export function columnWidths(header: string[], rows: Grid, sample = 200, min = 80, max = 320, charPx = 8): number[] {
  return header.map((h, c) => {
    let len = h.length + 5; // room for the sort button padding and icon
    for (let i = 0; i < Math.min(sample, rows.length); i++) len = Math.max(len, (rows[i][c] ?? '').length);
    return Math.min(max, Math.max(min, Math.round(len * charPx + 24)));
  });
}
