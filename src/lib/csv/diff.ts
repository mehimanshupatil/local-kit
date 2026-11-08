import { columnLabel, type Grid } from './csv';
import { headerKeys } from './merge';

export type DiffStatus = 'added' | 'removed' | 'changed' | 'unchanged';

export interface DiffColumn {
  name: string;
  /** Column index in the original file, or null when the column only exists in the changed file */
  original: number | null;
  /** Column index in the changed file, or null when the column only exists in the original file */
  changed: number | null;
}

export interface DiffCell {
  /** Value in the original file (undefined for added rows / changed-only columns) */
  old?: string;
  /** Value in the changed file (undefined for removed rows / original-only columns) */
  new?: string;
  changed: boolean;
}

export interface DiffRow {
  status: DiffStatus;
  cells: DiffCell[];
}

export interface DiffOptions {
  hasHeader: boolean;
  /** Index into the aligned columns to match rows by, or `'position'` to match row N with row N */
  key: number | 'position';
  ignoreCase: boolean;
  trim: boolean;
}

export interface DiffResult {
  columns: DiffColumn[];
  rows: DiffRow[];
  counts: Record<DiffStatus, number>;
  onlyInOriginal: string[];
  onlyInChanged: string[];
  /** Key values that occur more than once (only the first occurrence is matched) */
  duplicateKeys: { original: string[]; changed: string[] };
  /** Rows whose key cell is blank — they can't be matched, so they show as removed/added */
  blankKeys: { original: number; changed: number };
}

/**
 * Line up the columns of two files: by header name (trimmed, case-insensitive)
 * when there's a header row, otherwise by position. Original columns come first
 * in their own order, then columns that only exist in the changed file.
 */
export function alignColumns(original: Grid, changed: Grid, hasHeader: boolean): DiffColumn[] {
  if (!hasHeader) {
    const a = original[0]?.length ?? 0;
    const b = changed[0]?.length ?? 0;
    return Array.from({ length: Math.max(a, b) }, (_, i) => ({
      name: `Column ${columnLabel(i)}`,
      original: i < a ? i : null,
      changed: i < b ? i : null,
    }));
  }
  const origHeader = original[0] ?? [];
  const changedHeader = changed[0] ?? [];
  const changedKeys = headerKeys(changedHeader);
  const changedByKey = new Map(changedKeys.map((k, i) => [k, i]));
  const columns: DiffColumn[] = headerKeys(origHeader).map((key, i) => {
    const match = changedByKey.get(key);
    if (match !== undefined) changedByKey.delete(key);
    return { name: displayName(origHeader[i], i), original: i, changed: match ?? null };
  });
  for (const i of changedByKey.values()) {
    columns.push({ name: displayName(changedHeader[i], i), original: null, changed: i });
  }
  return columns;
}

const displayName = (h: string | undefined, i: number) => h?.trim() || `Column ${columnLabel(i)}`;

/** Columns present in both files — the only ones usable as a match key. */
export function commonColumns(columns: DiffColumn[]): number[] {
  return columns.flatMap((c, i) => (c.original !== null && c.changed !== null ? [i] : []));
}

export function diffCsv(original: Grid, changed: Grid, options: DiffOptions): DiffResult {
  const { hasHeader, ignoreCase, trim } = options;
  const columns = alignColumns(original, changed, hasHeader);
  const origData = hasHeader ? original.slice(1) : original;
  const changedData = hasHeader ? changed.slice(1) : changed;

  const norm = (v: string | undefined) => {
    let s = v ?? '';
    if (trim) s = s.trim();
    if (ignoreCase) s = s.toLowerCase();
    return s;
  };

  const compare = (a: string[] | undefined, b: string[] | undefined): DiffRow => {
    let anyChanged = false;
    const cells = columns.map(col => {
      const cell: DiffCell = { changed: false };
      if (a && col.original !== null) cell.old = a[col.original] ?? '';
      if (b && col.changed !== null) cell.new = b[col.changed] ?? '';
      if (a && b && col.original !== null && col.changed !== null && norm(cell.old) !== norm(cell.new)) {
        cell.changed = true;
        anyChanged = true;
      }
      return cell;
    });
    const status: DiffStatus = !a ? 'added' : !b ? 'removed' : anyChanged ? 'changed' : 'unchanged';
    return { status, cells };
  };

  const rows: DiffRow[] = [];
  const duplicateKeys = { original: [] as string[], changed: [] as string[] };
  const blankKeys = { original: 0, changed: 0 };

  if (options.key === 'position') {
    const n = Math.max(origData.length, changedData.length);
    for (let i = 0; i < n; i++) rows.push(compare(origData[i], changedData[i]));
  } else {
    const keyCol = columns[options.key];
    if (!keyCol || keyCol.original === null || keyCol.changed === null) {
      throw new Error('The key column must exist in both files.');
    }
    const keyOf = (row: string[], idx: number) => norm(row[idx]);

    // First occurrence of each key in the original
    const origIndex = new Map<string, number>();
    const origDupes = new Set<string>();
    origData.forEach((row, i) => {
      const k = keyOf(row, keyCol.original!);
      if (k.trim() === '') { blankKeys.original++; return; }
      if (origIndex.has(k)) origDupes.add(row[keyCol.original!]);
      else origIndex.set(k, i);
    });

    // Pass 1: pair each changed row with its original row (if any)
    const pairs: (number | undefined)[] = [];
    const matched = new Set<number>();
    const changedSeen = new Set<string>();
    const changedDupes = new Set<string>();
    for (const row of changedData) {
      const k = keyOf(row, keyCol.changed);
      let j: number | undefined;
      if (k.trim() === '') blankKeys.changed++;
      else if (changedSeen.has(k)) changedDupes.add(row[keyCol.changed]);
      else {
        changedSeen.add(k);
        j = origIndex.get(k);
        if (j !== undefined) matched.add(j);
      }
      pairs.push(j);
    }

    // Pass 2: emit in the changed file's order, slotting each removed original
    // row in just before the first matched row that followed it originally
    let nextOrig = 0;
    const flushRemovedBefore = (limit: number) => {
      for (; nextOrig < limit; nextOrig++) {
        if (!matched.has(nextOrig)) rows.push(compare(origData[nextOrig], undefined));
      }
    };
    changedData.forEach((row, i) => {
      const j = pairs[i];
      if (j === undefined) { rows.push(compare(undefined, row)); return; }
      flushRemovedBefore(j);
      rows.push(compare(origData[j], row));
    });
    flushRemovedBefore(origData.length);

    duplicateKeys.original = [...origDupes];
    duplicateKeys.changed = [...changedDupes];
  }

  const counts: Record<DiffStatus, number> = { added: 0, removed: 0, changed: 0, unchanged: 0 };
  for (const r of rows) counts[r.status]++;

  return {
    columns,
    rows,
    counts,
    onlyInOriginal: columns.filter(c => c.changed === null).map(c => c.name),
    onlyInChanged: columns.filter(c => c.original === null).map(c => c.name),
    duplicateKeys,
    blankKeys,
  };
}

/** Text for one cell of the report: `old → new` when changed, otherwise whichever value exists. */
export function cellText(cell: DiffCell): string {
  if (cell.changed) return `${cell.old} → ${cell.new}`;
  return cell.new ?? cell.old ?? '';
}

/** Flatten a diff into a CSV grid: `status` followed by every aligned column. */
export function diffReport(result: DiffResult): Grid {
  return [
    ['status', ...result.columns.map(c => c.name)],
    ...result.rows.map(r => [r.status, ...r.cells.map(cellText)]),
  ];
}
