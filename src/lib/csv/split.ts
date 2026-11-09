import type { Grid } from './csv';

/** Refuse to produce more files than this — almost always a wrong column choice. */
export const MAX_SPLIT_FILES = 1000;

export type SplitConfig =
  | { mode: 'rows'; rowsPerFile: number; hasHeader: boolean; repeatHeader: boolean }
  | { mode: 'column'; column: number; hasHeader: boolean };

export interface SplitPart {
  /** File name including `.csv` */
  name: string;
  rows: Grid;
}

const isBlank = (v: string | undefined) => (v ?? '').trim() === '';

function dataRows(rows: Grid, hasHeader: boolean): Grid {
  return hasHeader ? rows.slice(1) : rows;
}

/**
 * Turn a cell value into something safe for a file name: path separators,
 * reserved characters, control characters and whitespace collapse to `-`.
 * Blank values become `empty`; values with nothing usable left become `value`.
 */
export function safeFilePart(value: string, maxLength = 60): string {
  if (isBlank(value)) return 'empty';
  const safe = value
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f\s]+/g, '-')
    .replace(/-{2,}/g, '-')
    .slice(0, maxLength)
    .replace(/^[-.]+|[-.]+$/g, '');
  return safe || 'value';
}

/**
 * De-duplicate file names case-insensitively (macOS/Windows file systems and
 * ZIP extractors treat `A.csv` and `a.csv` as the same file) by suffixing
 * `-2`, `-3`, … before the extension.
 */
export function uniqueFileNames(names: string[]): string[] {
  const taken = new Set<string>();
  return names.map(name => {
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    let candidate = name;
    for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${stem}-${n}${ext}`;
    taken.add(candidate.toLowerCase());
    return candidate;
  });
}

/** Group key for a cell: blank / whitespace-only cells all go to one group. */
const groupKey = (v: string | undefined) => (isBlank(v) ? '' : (v as string));

/** How many files `splitCsv` would produce, without building them. */
export function countSplitParts(rows: Grid, config: SplitConfig): number {
  const data = dataRows(rows, config.hasHeader);
  if (config.mode === 'rows') {
    const size = Math.max(1, Math.floor(config.rowsPerFile) || 1);
    return Math.ceil(data.length / size);
  }
  return new Set(data.map(r => groupKey(r[config.column]))).size;
}

/**
 * Split a parsed CSV into parts.
 * - `rows`: consecutive chunks of N data rows, named `<base>-part-001.csv`…;
 *   the header goes in every part (or only the first when `repeatHeader` is off).
 * - `column`: one part per distinct value of a column (in first-seen order),
 *   named `<base>-<value>.csv`; blank values are grouped as `empty`.
 * Throws a user-facing Error when there is nothing to split or the result
 * would exceed MAX_SPLIT_FILES.
 */
export function splitCsv(rows: Grid, baseName: string, config: SplitConfig): SplitPart[] {
  const header = config.hasHeader ? rows[0] : undefined;
  const data = dataRows(rows, config.hasHeader);
  if (data.length === 0) throw new Error('There are no data rows to split.');

  const count = countSplitParts(rows, config);
  if (count > MAX_SPLIT_FILES) {
    throw new Error(
      `This would create ${count.toLocaleString('en-US')} files — the limit is ${MAX_SPLIT_FILES.toLocaleString('en-US')}. `
      + (config.mode === 'rows' ? 'Use more rows per file.' : 'Pick a column with fewer distinct values.'),
    );
  }

  if (config.mode === 'rows') {
    const size = Math.max(1, Math.floor(config.rowsPerFile) || 1);
    const width = Math.max(3, String(count).length);
    return Array.from({ length: count }, (_, i) => {
      const chunk = data.slice(i * size, (i + 1) * size);
      const withHeader = header && (config.repeatHeader || i === 0);
      return {
        name: `${baseName}-part-${String(i + 1).padStart(width, '0')}.csv`,
        rows: withHeader ? [header, ...chunk] : chunk,
      };
    });
  }

  const groups = new Map<string, Grid>();
  for (const row of data) {
    const key = groupKey(row[config.column]);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  const entries = [...groups.entries()];
  const names = uniqueFileNames(entries.map(([key]) => `${baseName}-${safeFilePart(key)}.csv`));
  return entries.map(([, groupRows], i) => ({
    name: names[i],
    rows: header ? [header, ...groupRows] : groupRows,
  }));
}
