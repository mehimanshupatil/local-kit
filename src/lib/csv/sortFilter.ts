import type { Grid } from './csv';

export type SortType = 'auto' | 'text' | 'number' | 'date';
export type SortDirection = 'asc' | 'desc';

export interface SortRule {
  column: number;
  direction: SortDirection;
  type: SortType;
}

export type FilterOperator =
  | 'equals' | 'not-equals' | 'contains' | 'not-contains' | 'starts-with' | 'ends-with'
  | 'gt' | 'lt' | 'gte' | 'lte' | 'empty' | 'not-empty';

export interface FilterRule {
  column: number;
  operator: FilterOperator;
  value: string;
}

export type FilterCombine = 'and' | 'or';

export const FILTER_OPERATORS: { value: FilterOperator; label: string }[] = [
  { value: 'equals', label: 'equals' },
  { value: 'not-equals', label: 'does not equal' },
  { value: 'contains', label: 'contains' },
  { value: 'not-contains', label: 'does not contain' },
  { value: 'starts-with', label: 'starts with' },
  { value: 'ends-with', label: 'ends with' },
  { value: 'gt', label: '>' },
  { value: 'lt', label: '<' },
  { value: 'gte', label: '≥' },
  { value: 'lte', label: '≤' },
  { value: 'empty', label: 'is empty' },
  { value: 'not-empty', label: 'is not empty' },
];

/** Operators that don't take a comparison value */
export function operatorNeedsValue(op: FilterOperator): boolean {
  return op !== 'empty' && op !== 'not-empty';
}

/**
 * Parse a cell as a number. Accepts optional sign, decimals, exponent, comma
 * thousands separators (1,234.5), a leading currency symbol and a trailing %.
 */
export function parseNumber(value: string): number | null {
  let s = value.trim();
  if (s === '') return null;
  s = s.replace(/^([+-]?)[$€£¥₹]\s*/, '$1').replace(/\s*%$/, '');
  if (/^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const ISO_DATE = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?\s*(Z|[+-]\d{2}:?\d{2})?)?$/i;

/**
 * Parse an ISO-style date (YYYY-MM-DD or YYYY/MM/DD, optional time and offset) to a
 * timestamp. Ambiguous formats like 01/02/2024 are deliberately not guessed.
 */
export function parseDate(value: string): number | null {
  const m = ISO_DATE.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h = '0', mi = '0', sec = '0', frac = '0', tz] = m;
  const month = Number(mo), day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const ms = Number(frac.slice(0, 3).padEnd(3, '0'));
  let t = Date.UTC(Number(y), month - 1, day, Number(h), Number(mi), Number(sec), ms);
  // Reject roll-over dates such as 2024-02-30
  if (new Date(t).getUTCDate() !== day) return null;
  if (tz && tz.toUpperCase() !== 'Z') {
    const sign = tz[0] === '-' ? -1 : 1;
    const digits = tz.slice(1).replace(':', '');
    t -= sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2))) * 60_000;
  }
  return t;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Resolve 'auto': number if every non-empty value is numeric, else date if every one is an ISO date, else text. */
export function detectType(values: string[]): Exclude<SortType, 'auto'> {
  const filled = values.filter(v => v.trim() !== '');
  if (filled.length === 0) return 'text';
  if (filled.every(v => parseNumber(v) !== null)) return 'number';
  if (filled.every(v => parseDate(v) !== null)) return 'date';
  return 'text';
}

type Key = { kind: 'empty' } | { kind: 'value'; n: number } | { kind: 'text'; s: string };

function sortKey(value: string, type: Exclude<SortType, 'auto'>): Key {
  if (value.trim() === '') return { kind: 'empty' };
  if (type === 'number') {
    const n = parseNumber(value);
    if (n !== null) return { kind: 'value', n };
  } else if (type === 'date') {
    const n = parseDate(value);
    if (n !== null) return { kind: 'value', n };
  }
  return { kind: 'text', s: value };
}

const RANK = { value: 0, text: 1, empty: 2 } as const;

/** Compare ignoring direction for the 'empty' group, which always sorts last. */
function compareKeys(a: Key, b: Key, direction: SortDirection): number {
  if (a.kind === 'empty' || b.kind === 'empty') return RANK[a.kind] - RANK[b.kind];
  const sign = direction === 'asc' ? 1 : -1;
  // In number/date mode, values that fail to parse group after the ones that do
  if (a.kind !== b.kind) return RANK[a.kind] - RANK[b.kind];
  if (a.kind === 'value' && b.kind === 'value') return sign * (a.n - b.n);
  return sign * collator.compare((a as { s: string }).s, (b as { s: string }).s);
}

/**
 * Stable multi-column sort of data rows. Empty values go last in either direction.
 * Rules referencing missing columns are ignored.
 */
export function sortRows(body: Grid, rules: SortRule[]): Grid {
  const width = body[0]?.length ?? 0;
  const active = rules.filter(r => r.column >= 0 && r.column < width);
  if (active.length === 0) return body;

  const types = active.map(r => (r.type === 'auto' ? detectType(body.map(row => row[r.column] ?? '')) : r.type));
  const keyed = body.map((row, index) => ({
    row,
    index,
    keys: active.map((r, i) => sortKey(row[r.column] ?? '', types[i])),
  }));
  keyed.sort((a, b) => {
    for (let i = 0; i < active.length; i++) {
      const c = compareKeys(a.keys[i], b.keys[i], active[i].direction);
      if (c !== 0) return c;
    }
    return a.index - b.index;
  });
  return keyed.map(k => k.row);
}

function compareOrdered(cell: string, value: string): number | null {
  const a = parseNumber(cell), b = parseNumber(value);
  if (a !== null && b !== null) return a - b;
  const da = parseDate(cell), db = parseDate(value);
  if (da !== null && db !== null) return da - db;
  return collator.compare(cell.trim(), value.trim());
}

/** Whether a rule should take part — text rules with no value yet are skipped so a half-built rule doesn't hide everything. */
export function isActiveFilter(rule: FilterRule, width: number): boolean {
  if (rule.column < 0 || rule.column >= width) return false;
  return !operatorNeedsValue(rule.operator) || rule.value.trim() !== '';
}

/** Test one cell against a rule. Text comparisons ignore case; ordered comparisons are numeric/date when both sides parse. */
export function matchesFilter(cell: string, rule: FilterRule): boolean {
  const isEmpty = cell.trim() === '';
  const a = cell.toLocaleLowerCase();
  const b = rule.value.toLocaleLowerCase();
  switch (rule.operator) {
    case 'empty': return isEmpty;
    case 'not-empty': return !isEmpty;
    case 'equals': return a.trim() === b.trim();
    case 'not-equals': return a.trim() !== b.trim();
    case 'contains': return a.includes(b);
    case 'not-contains': return !a.includes(b);
    case 'starts-with': return a.trimStart().startsWith(b.trimStart());
    case 'ends-with': return a.trimEnd().endsWith(b.trimEnd());
    case 'gt': case 'lt': case 'gte': case 'lte': {
      if (isEmpty) return false;
      const c = compareOrdered(cell, rule.value);
      if (c === null) return false;
      return rule.operator === 'gt' ? c > 0 : rule.operator === 'lt' ? c < 0 : rule.operator === 'gte' ? c >= 0 : c <= 0;
    }
  }
}

export function filterRows(body: Grid, rules: FilterRule[], combine: FilterCombine): Grid {
  const width = body[0]?.length ?? 0;
  const active = rules.filter(r => isActiveFilter(r, width));
  if (active.length === 0) return body;
  return body.filter(row => {
    const test = (r: FilterRule) => matchesFilter(row[r.column] ?? '', r);
    return combine === 'and' ? active.every(test) : active.some(test);
  });
}

export interface SortFilterOptions {
  header: boolean;
  sorts: SortRule[];
  filters: FilterRule[];
  combine: FilterCombine;
}

export interface SortFilterResult {
  rows: Grid;
  /** Data rows that passed the filters */
  matched: number;
  /** Data rows before filtering */
  total: number;
}

/** Filter then sort the data rows; the header row (when enabled) always stays on top. */
export function sortAndFilter(rows: Grid, opts: SortFilterOptions): SortFilterResult {
  const head = opts.header ? rows.slice(0, 1) : [];
  const body = opts.header ? rows.slice(1) : rows;
  const filtered = filterRows(body, opts.filters, opts.combine);
  const sorted = sortRows(filtered, opts.sorts);
  return { rows: [...head, ...sorted], matched: filtered.length, total: body.length };
}
