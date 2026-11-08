import type { Grid } from './csv';

export type TextCase = 'none' | 'lower' | 'upper' | 'title';

export interface CleanOptions {
  /** First row is a header: never removed as empty/duplicate and never re-cased */
  header: boolean;
  trim: boolean;
  collapseSpaces: boolean;
  invisible: boolean;
  removeEmptyRows: boolean;
  removeEmptyColumns: boolean;
  dedupe: boolean;
  dedupeIgnoreCase: boolean;
  textCase: TextCase;
  /** Column to re-case, or null for every column */
  caseColumn: number | null;
}

export const DEFAULT_CLEAN_OPTIONS: CleanOptions = {
  header: true,
  trim: true,
  collapseSpaces: true,
  invisible: true,
  removeEmptyRows: true,
  removeEmptyColumns: true,
  dedupe: true,
  dedupeIgnoreCase: false,
  textCase: 'none',
  caseColumn: null,
};

export interface CleanResult {
  rows: Grid;
  cellsChanged: number;
  rowsRemoved: number;
  columnsRemoved: number;
}

/**
 * Zero-width space, word joiner, BOM, Mongolian vowel separator, soft hyphen and
 * C0/C1 control characters (except tab and line breaks). ZWJ/ZWNJ are left alone:
 * they carry meaning in emoji sequences and in Persian/Indic scripts.
 */
const INVISIBLE = /[\u200B\u2060\uFEFF\u180E\u00AD\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
/** Non-breaking, figure, narrow no-break and other fixed-width spaces */
const ODD_SPACES = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;

export function replaceInvisible(value: string): string {
  return value.replace(INVISIBLE, '').replace(ODD_SPACES, ' ');
}

/** Collapse runs of spaces/tabs to one space. Line breaks inside a cell are kept. */
export function collapseSpaces(value: string): string {
  return value.replace(/[ \t]{2,}/g, ' ');
}

export function toTitleCase(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/(^|[^\p{L}\p{N}'’])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toLocaleUpperCase());
}

export function applyCase(value: string, textCase: TextCase): string {
  switch (textCase) {
    case 'lower': return value.toLocaleLowerCase();
    case 'upper': return value.toLocaleUpperCase();
    case 'title': return toTitleCase(value);
    default: return value;
  }
}

function cleanCell(value: string, opts: CleanOptions, recase: boolean): string {
  let v = value;
  if (opts.invisible) v = replaceInvisible(v);
  if (opts.collapseSpaces) v = collapseSpaces(v);
  if (opts.trim) v = v.trim();
  if (recase) v = applyCase(v, opts.textCase);
  return v;
}

const isEmptyRow = (row: string[]) => row.every(c => c === '');

/**
 * Clean a grid. Order: per-cell cleanups (invisible chars → spaces → trim → case),
 * then empty rows, empty columns, and finally duplicate rows — so rows that only
 * differed by whitespace count as duplicates.
 */
export function cleanGrid(input: Grid, opts: CleanOptions): CleanResult {
  let cellsChanged = 0;
  let rows = input.map((row, r) => row.map((cell, c) => {
    const isHeader = opts.header && r === 0;
    const recase = opts.textCase !== 'none' && !isHeader && (opts.caseColumn === null || opts.caseColumn === c);
    const next = cleanCell(cell, opts, recase);
    if (next !== cell) cellsChanged++;
    return next;
  }));

  const headerRow = opts.header ? rows.slice(0, 1) : [];
  let body = opts.header ? rows.slice(1) : rows;
  const bodyBefore = body.length;

  if (opts.removeEmptyRows) body = body.filter(r => !isEmptyRow(r));

  if (opts.dedupe) {
    const seen = new Set<string>();
    body = body.filter(r => {
      const key = JSON.stringify(opts.dedupeIgnoreCase ? r.map(c => c.toLocaleLowerCase()) : r);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  const rowsRemoved = bodyBefore - body.length;
  rows = [...headerRow, ...body];

  let columnsRemoved = 0;
  if (opts.removeEmptyColumns && rows.length > 0) {
    const width = rows[0].length;
    const keep = Array.from({ length: width }, (_, c) => rows.some(r => (r[c] ?? '') !== ''));
    // Keep at least one column so the output is never a zero-width table
    if (!keep.some(Boolean) && width > 0) keep[0] = true;
    columnsRemoved = keep.filter(k => !k).length;
    if (columnsRemoved > 0) rows = rows.map(r => r.filter((_, c) => keep[c]));
  }

  return { rows, cellsChanged, rowsRemoved, columnsRemoved };
}
