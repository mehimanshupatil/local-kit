import type { Grid } from './csv';

/**
 * Pure helpers for the CSV Chart tool: tolerant number parsing, numeric column
 * detection and turning rows into chart series (aggregation, sorting, top-N).
 */

export type ChartType = 'bar' | 'horizontal-bar' | 'line' | 'area' | 'pie';
export type Aggregation = 'none' | 'sum' | 'average' | 'count' | 'min' | 'max';
export type SeriesSort = 'original' | 'value-desc' | 'value-asc' | 'label';

const CURRENCY_CODE = /^(?:USD|EUR|GBP|INR|JPY|CNY|AUD|CAD|CHF)|(?:USD|EUR|GBP|INR|JPY|CNY|AUD|CAD|CHF)$/gi;

const SUFFIX: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9, bn: 1e9 };

/**
 * Parse a human-formatted number. Accepts:
 * - currency symbols and codes before or after: "$1,234.50", "€ 12", "1200 USD"
 * - comma thousands separators in groups of three ("1,234,567"); "1,5" is rejected as ambiguous
 * - percent signs ("12.5%" → 12.5)
 * - accounting negatives "(1,234)" and a leading +/- sign
 * - k / M / B (or bn) magnitude suffixes, case-insensitive ("1.5k" → 1500, "2M" → 2000000)
 * Returns `null` for anything else (empty, text, dates, "1,5", "12abc").
 */
export function parseNumber(raw: string): number | null {
  let s = raw.trim();
  if (s === '') return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1).trim(); }
  // Currency symbols / ISO codes and whitespace (incl. NBSP / thin spaces) anywhere around the number.
  s = s.replace(/\u2212/g, '-').replace(/[$€£¥₹₩₽₺₦₪฿\s\u00a0\u2009\u202f]/g, '').replace(CURRENCY_CODE, '');
  if (s.startsWith('-')) { negative = !negative; s = s.slice(1); }
  else if (s.startsWith('+')) s = s.slice(1);
  if (s.endsWith('%')) s = s.slice(0, -1);
  let multiplier = 1;
  const suffix = /(bn|[kmb])$/i.exec(s);
  if (suffix) { multiplier = SUFFIX[suffix[1].toLowerCase()]; s = s.slice(0, -suffix[1].length); }
  if (!/^(?:\d{1,3}(?:,\d{3})+|\d+)?(?:\.\d+)?(?:e[-+]?\d+)?$/i.test(s) || !/^\.?\d/.test(s)) return null;
  const n = Number(s.replace(/,/g, '')) * multiplier;
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/**
 * Columns that are mostly numeric: at least one value parses and at least
 * `threshold` of the non-empty cells do. Returns column indices.
 */
export function numericColumns(data: Grid, threshold = 0.8): number[] {
  const width = data[0]?.length ?? 0;
  const result: number[] = [];
  for (let c = 0; c < width; c++) {
    let nonEmpty = 0, numeric = 0;
    for (const row of data) {
      const v = row[c] ?? '';
      if (v.trim() === '') continue;
      nonEmpty++;
      if (parseNumber(v) !== null) numeric++;
    }
    if (numeric > 0 && numeric / nonEmpty >= threshold) result.push(c);
  }
  return result;
}

export interface SeriesOptions {
  labelCol: number;
  /** Value columns; ignored for `count` aggregation */
  valueCols: number[];
  aggregation: Aggregation;
  sort: SeriesSort;
  /** Keep at most this many points (0 / Infinity = no limit) */
  topN: number;
  /** Sum everything past `topN` into a final "Other" point */
  other?: boolean;
  /** Drop points whose (first) value is ≤ 0 — pie slices can't be negative */
  positiveOnly?: boolean;
}

export interface SeriesPoint {
  label: string;
  /** One value per series, keyed `v0`, `v1`, … (or `count`) */
  [key: string]: string | number | null;
}

export interface SeriesResult {
  points: SeriesPoint[];
  /** Data keys in series order, matching `valueCols` (or `['count']`) */
  keys: string[];
  /** Value cells that were empty or not numeric and so were left out */
  skipped: number;
  /** Points dropped by `positiveOnly` */
  nonPositive: number;
  /** Points folded into "Other" or cut by the top-N limit */
  truncated: number;
}

export const BLANK_LABEL = '(blank)';
export const OTHER_LABEL = 'Other';

interface Acc { sum: number; count: number; min: number; max: number }

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Build chart points from data rows (header excluded). */
export function buildSeries(data: Grid, opts: SeriesOptions): SeriesResult {
  const { labelCol, aggregation } = opts;
  const isCount = aggregation === 'count';
  const keys = isCount ? ['count'] : opts.valueCols.map((_, i) => `v${i}`);
  let skipped = 0;
  let points: SeriesPoint[];

  if (aggregation === 'none') {
    points = [];
    for (const row of data) {
      const point: SeriesPoint = { label: labelOf(row[labelCol]) };
      let any = false;
      opts.valueCols.forEach((c, i) => {
        const n = parseNumber(row[c] ?? '');
        if (n === null) skipped++;
        else any = true;
        point[keys[i]] = n;
      });
      if (any) points.push(point);
    }
  } else {
    const groups = new Map<string, Acc[]>();
    for (const row of data) {
      const label = labelOf(row[labelCol]);
      let accs = groups.get(label);
      if (!accs) {
        accs = keys.map(() => ({ sum: 0, count: 0, min: Infinity, max: -Infinity }));
        groups.set(label, accs);
      }
      if (isCount) { accs[0].count++; continue; }
      opts.valueCols.forEach((c, i) => {
        const n = parseNumber(row[c] ?? '');
        if (n === null) { skipped++; return; }
        const a = accs[i];
        a.sum += n; a.count++;
        if (n < a.min) a.min = n;
        if (n > a.max) a.max = n;
      });
    }
    points = [];
    for (const [label, accs] of groups) {
      if (accs.every(a => a.count === 0)) continue;
      const point: SeriesPoint = { label };
      accs.forEach((a, i) => { point[keys[i]] = a.count === 0 ? null : reduce(a, aggregation); });
      points.push(point);
    }
  }

  let nonPositive = 0;
  if (opts.positiveOnly) {
    const before = points.length;
    points = points.filter(p => (p[keys[0]] as number | null) !== null && (p[keys[0]] as number) > 0);
    nonPositive = before - points.length;
  }

  points = sortPoints(points, keys[0], opts.sort);

  let truncated = 0;
  const limit = opts.topN > 0 ? opts.topN : Infinity;
  if (points.length > limit) {
    const rest = points.slice(limit);
    truncated = rest.length;
    points = points.slice(0, limit);
    if (opts.other) {
      const other: SeriesPoint = { label: OTHER_LABEL };
      keys.forEach(k => { other[k] = rest.reduce((s, p) => s + ((p[k] as number | null) ?? 0), 0); });
      points.push(other);
    }
  }

  return { points, keys, skipped, nonPositive, truncated };
}

function labelOf(v: string | undefined): string {
  const s = (v ?? '').trim();
  return s === '' ? BLANK_LABEL : s;
}

function reduce(a: Acc, agg: Aggregation): number {
  switch (agg) {
    case 'average': return a.sum / a.count;
    case 'min': return a.min;
    case 'max': return a.max;
    case 'count': return a.count;
    default: return a.sum;
  }
}

/** Stable sort of points; null values sort last in value orders. */
export function sortPoints(points: SeriesPoint[], key: string, sort: SeriesSort): SeriesPoint[] {
  if (sort === 'original') return points;
  const sorted = [...points];
  if (sort === 'label') return sorted.sort((a, b) => collator.compare(a.label, b.label));
  const sign = sort === 'value-asc' ? 1 : -1;
  return sorted.sort((a, b) => {
    const va = a[key] as number | null, vb = b[key] as number | null;
    if (va === null || vb === null) return va === vb ? 0 : va === null ? 1 : -1;
    return sign * (va - vb);
  });
}
