import { describe, expect, it } from 'vitest';
import {
  detectType, filterRows, isActiveFilter, matchesFilter, parseDate, parseNumber, sortAndFilter, sortRows,
  type FilterRule,
} from './sortFilter';

describe('parseNumber', () => {
  it('parses plain, signed, decimal and exponent numbers', () => {
    expect(parseNumber('42')).toBe(42);
    expect(parseNumber(' -3.5 ')).toBe(-3.5);
    expect(parseNumber('+.5')).toBe(0.5);
    expect(parseNumber('1e3')).toBe(1000);
  });

  it('accepts thousands separators, currency and percent', () => {
    expect(parseNumber('1,234,567.89')).toBe(1234567.89);
    expect(parseNumber('$1,200')).toBe(1200);
    expect(parseNumber('-€5')).toBe(-5);
    expect(parseNumber('12%')).toBe(12);
  });

  it('rejects text, empty, malformed groupings and dates', () => {
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('12,34')).toBeNull();
    expect(parseNumber('2024-01-05')).toBeNull();
    expect(parseNumber('1.2.3')).toBeNull();
  });
});

describe('parseDate', () => {
  it('parses ISO dates and datetimes', () => {
    expect(parseDate('2024-01-05')).toBe(Date.UTC(2024, 0, 5));
    expect(parseDate('2024/1/5')).toBe(Date.UTC(2024, 0, 5));
    expect(parseDate('2024-01-05T10:30:15.250Z')).toBe(Date.UTC(2024, 0, 5, 10, 30, 15, 250));
    expect(parseDate('2024-01-05 10:30')).toBe(Date.UTC(2024, 0, 5, 10, 30));
  });

  it('applies timezone offsets', () => {
    expect(parseDate('2024-01-05T10:00+02:00')).toBe(Date.UTC(2024, 0, 5, 8));
  });

  it('rejects invalid and ambiguous dates', () => {
    expect(parseDate('2024-02-30')).toBeNull();
    expect(parseDate('2024-13-01')).toBeNull();
    expect(parseDate('01/02/2024')).toBeNull();
    expect(parseDate('yesterday')).toBeNull();
  });
});

describe('detectType', () => {
  it('ignores empty values', () => {
    expect(detectType(['10', '', '9'])).toBe('number');
    expect(detectType(['2024-01-02', ' ', '2023-12-31'])).toBe('date');
    expect(detectType(['10', 'x'])).toBe('text');
    expect(detectType(['', ''])).toBe('text');
  });
});

describe('sortRows', () => {
  it('auto-detects numbers so 10 sorts after 9', () => {
    const body = [['10'], ['9'], ['100']];
    expect(sortRows(body, [{ column: 0, direction: 'asc', type: 'auto' }])).toEqual([['9'], ['10'], ['100']]);
    expect(sortRows(body, [{ column: 0, direction: 'asc', type: 'text' }])).toEqual([['9'], ['10'], ['100']]);
  });

  it('puts empty values last in both directions', () => {
    const body = [[''], ['2'], ['1'], ['']];
    expect(sortRows(body, [{ column: 0, direction: 'asc', type: 'number' }]).map(r => r[0])).toEqual(['1', '2', '', '']);
    expect(sortRows(body, [{ column: 0, direction: 'desc', type: 'number' }]).map(r => r[0])).toEqual(['2', '1', '', '']);
  });

  it('is stable for equal keys', () => {
    const body = [['b', '1'], ['a', '2'], ['b', '3'], ['a', '4']];
    expect(sortRows(body, [{ column: 0, direction: 'asc', type: 'text' }]).map(r => r[1])).toEqual(['2', '4', '1', '3']);
    expect(sortRows(body, [{ column: 0, direction: 'desc', type: 'text' }]).map(r => r[1])).toEqual(['1', '3', '2', '4']);
  });

  it('uses natural, case-insensitive text order', () => {
    const body = [['file10'], ['File2'], ['file1']];
    expect(sortRows(body, [{ column: 0, direction: 'asc', type: 'text' }]).map(r => r[0])).toEqual(['file1', 'File2', 'file10']);
  });

  it('sorts dates chronologically, not lexically', () => {
    const body = [['2024-1-10'], ['2024-01-09'], ['2023-12-31T23:00Z']];
    expect(sortRows(body, [{ column: 0, direction: 'asc', type: 'date' }]).map(r => r[0]))
      .toEqual(['2023-12-31T23:00Z', '2024-01-09', '2024-1-10']);
  });

  it('groups unparseable values after numbers in number mode', () => {
    const body = [['n/a'], ['5'], ['1']];
    expect(sortRows(body, [{ column: 0, direction: 'desc', type: 'number' }]).map(r => r[0])).toEqual(['5', '1', 'n/a']);
  });

  it('applies later rules as tie-breakers', () => {
    const body = [['x', '2'], ['y', '1'], ['x', '1']];
    const out = sortRows(body, [
      { column: 0, direction: 'asc', type: 'text' },
      { column: 1, direction: 'desc', type: 'auto' },
    ]);
    expect(out).toEqual([['x', '2'], ['x', '1'], ['y', '1']]);
  });

  it('ignores rules for missing columns', () => {
    const body = [['b'], ['a']];
    expect(sortRows(body, [{ column: 4, direction: 'asc', type: 'text' }])).toEqual(body);
  });
});

describe('matchesFilter', () => {
  const rule = (operator: FilterRule['operator'], value = ''): FilterRule => ({ column: 0, operator, value });

  it('compares text case-insensitively', () => {
    expect(matchesFilter('Paris', rule('equals', 'paris'))).toBe(true);
    expect(matchesFilter('Paris', rule('not-equals', 'PARIS'))).toBe(false);
    expect(matchesFilter('New York', rule('contains', 'YORK'))).toBe(true);
    expect(matchesFilter('New York', rule('not-contains', 'york'))).toBe(false);
    expect(matchesFilter('New York', rule('starts-with', 'new'))).toBe(true);
    expect(matchesFilter('New York', rule('ends-with', 'ORK'))).toBe(true);
  });

  it('compares numbers numerically', () => {
    expect(matchesFilter('10', rule('gt', '9'))).toBe(true);
    expect(matchesFilter('1,000', rule('gte', '1000'))).toBe(true);
    expect(matchesFilter('9', rule('lt', '10'))).toBe(true);
    expect(matchesFilter('10', rule('lte', '9'))).toBe(false);
  });

  it('compares ISO dates chronologically', () => {
    expect(matchesFilter('2024-02-01', rule('gt', '2024-1-15'))).toBe(true);
  });

  it('never matches empty cells with ordered operators', () => {
    expect(matchesFilter('', rule('lt', '5'))).toBe(false);
  });

  it('handles empty / not-empty', () => {
    expect(matchesFilter('  ', rule('empty'))).toBe(true);
    expect(matchesFilter('x', rule('empty'))).toBe(false);
    expect(matchesFilter('x', rule('not-empty'))).toBe(true);
  });
});

describe('filterRows', () => {
  const body = [['Ann', '30'], ['Bob', '25'], ['Cy', '']];

  it('combines with AND', () => {
    const rules: FilterRule[] = [
      { column: 1, operator: 'gte', value: '25' },
      { column: 0, operator: 'contains', value: 'b' },
    ];
    expect(filterRows(body, rules, 'and')).toEqual([['Bob', '25']]);
  });

  it('combines with OR', () => {
    const rules: FilterRule[] = [
      { column: 1, operator: 'empty', value: '' },
      { column: 0, operator: 'equals', value: 'ann' },
    ];
    expect(filterRows(body, rules, 'or')).toEqual([['Ann', '30'], ['Cy', '']]);
  });

  it('skips rules still waiting for a value', () => {
    expect(isActiveFilter({ column: 0, operator: 'contains', value: '' }, 2)).toBe(false);
    expect(isActiveFilter({ column: 0, operator: 'empty', value: '' }, 2)).toBe(true);
    expect(filterRows(body, [{ column: 0, operator: 'contains', value: '' }], 'and')).toEqual(body);
  });
});

describe('sortAndFilter', () => {
  const rows = [['name', 'age'], ['Bob', '25'], ['Ann', '30'], ['Cy', '19']];

  it('keeps the header on top and reports counts', () => {
    const res = sortAndFilter(rows, {
      header: true,
      sorts: [{ column: 1, direction: 'desc', type: 'auto' }],
      filters: [{ column: 1, operator: 'gt', value: '20' }],
      combine: 'and',
    });
    expect(res.rows).toEqual([['name', 'age'], ['Ann', '30'], ['Bob', '25']]);
    expect(res.matched).toBe(2);
    expect(res.total).toBe(3);
  });

  it('sorts the first row too without a header', () => {
    const res = sortAndFilter(rows, {
      header: false, sorts: [{ column: 0, direction: 'asc', type: 'text' }], filters: [], combine: 'and',
    });
    expect(res.rows.map(r => r[0])).toEqual(['Ann', 'Bob', 'Cy', 'name']);
    expect(res.total).toBe(4);
  });

  it('auto type detection ignores the header row', () => {
    const res = sortAndFilter([['n'], ['10'], ['9']], {
      header: true, sorts: [{ column: 0, direction: 'asc', type: 'auto' }], filters: [], combine: 'and',
    });
    expect(res.rows).toEqual([['n'], ['9'], ['10']]);
  });
});
