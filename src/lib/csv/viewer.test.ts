import { describe, expect, it } from 'vitest';
import {
  buildSearchIndex, columnStats, columnWidths, filterIndices, inferType, nextSort, parseCellNumber, parseIsoDate,
  sortIndices,
} from './viewer';

describe('nextSort', () => {
  it('cycles asc → desc → none on the same column', () => {
    const a = nextSort(null, 2);
    expect(a).toEqual({ col: 2, dir: 'asc' });
    const d = nextSort(a, 2);
    expect(d).toEqual({ col: 2, dir: 'desc' });
    expect(nextSort(d, 2)).toBeNull();
  });

  it('starts at asc when switching columns', () => {
    expect(nextSort({ col: 0, dir: 'desc' }, 1)).toEqual({ col: 1, dir: 'asc' });
  });
});

describe('parseCellNumber', () => {
  it.each([
    ['42', 42], ['-3.5', -3.5], ['+7', 7], ['.5', 0.5], ['1,234,567.89', 1234567.89], ['1e3', 1000], [' 12 ', 12],
  ])('parses %s', (input, expected) => {
    expect(parseCellNumber(input)).toBe(expected);
  });

  it.each(['', 'abc', '1,23', '12abc', '$5', '1.2.3', 'e5', '-'])('rejects %j', input => {
    expect(parseCellNumber(input)).toBeNull();
  });
});

describe('parseIsoDate', () => {
  it('accepts ISO dates and date-times', () => {
    expect(parseIsoDate('2024-03-05')).toBe(Date.parse('2024-03-05'));
    expect(parseIsoDate('2024-03-05 10:30')).not.toBeNull();
    expect(parseIsoDate('2024-03-05T10:30:00Z')).toBe(Date.parse('2024-03-05T10:30:00Z'));
    expect(parseIsoDate('2024-03-05T10:30:00.123+05:30')).not.toBeNull();
  });

  it('rejects non-ISO formats and impossible dates', () => {
    expect(parseIsoDate('03/05/2024')).toBeNull();
    expect(parseIsoDate('2024-13-45')).toBeNull();
    expect(parseIsoDate('March 5')).toBeNull();
  });
});

describe('inferType', () => {
  it('detects numbers, ignoring empties', () => {
    expect(inferType(['1', '', '2.5', '-3', '1,000'])).toBe('number');
  });
  it('detects ISO dates', () => {
    expect(inferType(['2024-01-01', '2024-12-31T23:59:00Z'])).toBe('date');
  });
  it('detects booleans case-insensitively', () => {
    expect(inferType(['TRUE', 'false', 'Yes', 'no'])).toBe('boolean');
  });
  it('falls back to text when values are mixed', () => {
    expect(inferType(['1', 'two'])).toBe('text');
    expect(inferType(['2024-01-01', '5'])).toBe('text');
  });
  it('treats all-empty columns as text', () => {
    expect(inferType(['', ' '])).toBe('text');
    expect(inferType([])).toBe('text');
  });
});

describe('sortIndices', () => {
  const col = (values: string[]) => values.map(v => [v]);
  const sorted = (values: string[], dir: 'asc' | 'desc') =>
    sortIndices(col(values), { col: 0, dir }).map(i => values[i]);

  it('returns file order when not sorting', () => {
    expect(sortIndices(col(['b', 'a']), null)).toEqual([0, 1]);
  });

  it('sorts numbers numerically, not lexically', () => {
    expect(sorted(['10', '9', '100', '-1', '1,000'], 'asc')).toEqual(['-1', '9', '10', '100', '1,000']);
    expect(sorted(['10', '9', '100'], 'desc')).toEqual(['100', '10', '9']);
  });

  it('puts empty cells last in both directions', () => {
    expect(sorted(['3', '', '1', ' ', '2'], 'asc')).toEqual(['1', '2', '3', '', ' ']);
    expect(sorted(['3', '', '1', '2'], 'desc')).toEqual(['3', '2', '1', '']);
  });

  it('sorts text naturally and case-insensitively, numbers before text', () => {
    expect(sorted(['item10', 'Item2', 'apple', '5'], 'asc')).toEqual(['5', 'apple', 'Item2', 'item10']);
  });

  it('is stable for ties in both directions', () => {
    const rows = [['a', '1'], ['b', '2'], ['a', '3'], ['b', '4']];
    expect(sortIndices(rows, { col: 0, dir: 'asc' })).toEqual([0, 2, 1, 3]);
    expect(sortIndices(rows, { col: 0, dir: 'desc' })).toEqual([1, 3, 0, 2]);
  });

  it('handles 200k rows quickly', () => {
    const rows = Array.from({ length: 200_000 }, (_, i) => [String((i * 7919) % 100_003)]);
    const t = performance.now();
    const out = sortIndices(rows, { col: 0, dir: 'asc' });
    expect(performance.now() - t).toBeLessThan(2000);
    expect(Number(rows[out[0]][0])).toBeLessThanOrEqual(Number(rows[out[1]][0]));
  });
});

describe('search', () => {
  const rows = [['Alice', 'London'], ['Bob', 'Paris'], ['carol', 'LONDONDERRY']];
  const index = buildSearchIndex(rows);

  it('matches a case-insensitive substring in any cell', () => {
    expect(filterIndices([0, 1, 2], index, 'london')).toEqual([0, 2]);
    expect(filterIndices([0, 1, 2], index, 'CAR')).toEqual([2]);
  });

  it('keeps the incoming (sorted) order', () => {
    expect(filterIndices([2, 1, 0], index, 'o')).toEqual([2, 1, 0]);
  });

  it('returns all indices for a blank query', () => {
    const all = [0, 1, 2];
    expect(filterIndices(all, index, '  ')).toBe(all);
  });

  it('does not match across cell boundaries', () => {
    expect(filterIndices([0, 1, 2], index, 'alicelondon')).toEqual([]);
  });
});

describe('columnStats', () => {
  it('summarises a numeric column', () => {
    const rows = [['10'], ['20'], [''], ['30'], ['20']];
    const s = columnStats(rows, 0);
    expect(s).toMatchObject({ count: 5, nonEmpty: 4, empty: 1, unique: 3, type: 'number' });
    expect(s.number).toEqual({ min: 10, max: 30, sum: 80, mean: 20 });
    expect(s.top[0]).toEqual({ value: '20', count: 2 });
  });

  it('reports min/max dates by time, returning the original text', () => {
    const rows = [['2024-05-01'], ['2023-12-31T10:00:00Z'], ['2024-01-15']];
    const s = columnStats(rows, 0);
    expect(s.type).toBe('date');
    expect(s.date).toEqual({ min: '2023-12-31T10:00:00Z', max: '2024-05-01' });
    expect(s.number).toBeUndefined();
  });

  it('limits top values to five, most frequent first, ties by value', () => {
    const rows = ['b', 'a', 'c', 'a', 'd', 'e', 'f', 'b', 'a'].map(v => [v]);
    const s = columnStats(rows, 0);
    expect(s.type).toBe('text');
    expect(s.top).toEqual([
      { value: 'a', count: 3 }, { value: 'b', count: 2 }, { value: 'c', count: 1 },
      { value: 'd', count: 1 }, { value: 'e', count: 1 },
    ]);
  });

  it('only counts the given row indices', () => {
    const rows = [['1'], ['x'], ['3']];
    const s = columnStats(rows, 0, [0, 2]);
    expect(s).toMatchObject({ count: 2, type: 'number', number: { sum: 4 } });
  });

  it('handles an all-empty column', () => {
    const s = columnStats([[''], ['']], 0);
    expect(s).toMatchObject({ nonEmpty: 0, empty: 2, unique: 0, type: 'text', top: [] });
  });
});

describe('columnWidths', () => {
  it('clamps between min and max based on content length', () => {
    const w = columnWidths(['id', 'description'], [['1', 'x'.repeat(500)]]);
    expect(w[0]).toBe(80);
    expect(w[1]).toBe(320);
  });
});
