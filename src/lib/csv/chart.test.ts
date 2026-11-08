import { describe, expect, it } from 'vitest';
import { BLANK_LABEL, OTHER_LABEL, buildSeries, numericColumns, parseNumber, sortPoints, type SeriesOptions } from './chart';

describe('parseNumber', () => {
  it.each([
    ['42', 42],
    ['-3.5', -3.5],
    ['.5', 0.5],
    ['1,234', 1234],
    ['1,234,567.89', 1234567.89],
    ['$1,234.50', 1234.5],
    ['-$5', -5],
    ['$-5', -5],
    ['€ 12', 12],
    ['£1,000', 1000],
    ['₹250,000', 250000],
    ['1200 USD', 1200],
    ['EUR 99.99', 99.99],
    ['(1,234)', -1234],
    ['($50.00)', -50],
    ['12.5%', 12.5],
    ['1.5k', 1500],
    ['2K', 2000],
    ['3M', 3_000_000],
    ['1.2B', 1_200_000_000],
    ['4bn', 4_000_000_000],
    ['1e3', 1000],
    ['−5', -5],
    ['1 000'.replace(' 000', ',000'), 1000],
    [' 7 ', 7],
  ])('parses %j as %d', (input, expected) => {
    expect(parseNumber(input)).toBeCloseTo(expected, 6);
  });

  it.each(['', '  ', 'abc', 'N/A', '-', '$', '1,5', '1,2345', '12abc', '1.2.3', '2024-01-01', 'k', '5kg', 'NaN', 'Infinity'])(
    'rejects %j', input => {
      expect(parseNumber(input)).toBeNull();
    });
});

describe('numericColumns', () => {
  it('picks columns where most non-empty cells are numbers', () => {
    const data = [
      ['a', '$1', '1', 'x'],
      ['b', '$2', 'two', 'y'],
      ['c', '', 'three', '1'],
      ['d', '$4', 'four', 'z'],
    ];
    expect(numericColumns(data)).toEqual([1]);
  });

  it('tolerates a few stray values above the threshold', () => {
    const data = [['1'], ['2'], ['3'], ['4'], ['n/a']];
    expect(numericColumns(data)).toEqual([0]);
    expect(numericColumns(data, 0.9)).toEqual([]);
  });

  it('returns nothing for an all-text grid', () => {
    expect(numericColumns([['a', 'b']])).toEqual([]);
  });
});

const base: SeriesOptions = { labelCol: 0, valueCols: [1], aggregation: 'none', sort: 'original', topN: 0 };

describe('buildSeries', () => {
  const sales = [
    ['North', '10', '1'],
    ['South', '$20', '2'],
    ['North', '30', 'x'],
    ['East', 'n/a', '4'],
    ['', '5', '5'],
  ];

  it('without aggregation emits one point per row and counts skipped cells', () => {
    const r = buildSeries(sales, base);
    expect(r.keys).toEqual(['v0']);
    expect(r.points).toEqual([
      { label: 'North', v0: 10 }, { label: 'South', v0: 20 }, { label: 'North', v0: 30 }, { label: BLANK_LABEL, v0: 5 },
    ]);
    expect(r.skipped).toBe(1);
  });

  it('keeps a row with one bad value among several series, as a gap', () => {
    const r = buildSeries(sales, { ...base, valueCols: [1, 2] });
    expect(r.keys).toEqual(['v0', 'v1']);
    expect(r.points[2]).toEqual({ label: 'North', v0: 30, v1: null });
    expect(r.points[3]).toEqual({ label: 'East', v0: null, v1: 4 });
    expect(r.skipped).toBe(2);
  });

  it.each([
    ['sum', 40],
    ['average', 20],
    ['min', 10],
    ['max', 30],
  ] as const)('aggregates repeated labels with %s', (aggregation, north) => {
    const r = buildSeries(sales, { ...base, aggregation });
    expect(r.points.find(p => p.label === 'North')?.v0).toBe(north);
    expect(r.points.map(p => p.label)).toEqual(['North', 'South', BLANK_LABEL]); // East had no numeric value
  });

  it('count needs no value column and counts rows per label', () => {
    const r = buildSeries(sales, { ...base, aggregation: 'count', valueCols: [] });
    expect(r.keys).toEqual(['count']);
    expect(r.points).toEqual([
      { label: 'North', count: 2 }, { label: 'South', count: 1 }, { label: 'East', count: 1 }, { label: BLANK_LABEL, count: 1 },
    ]);
    expect(r.skipped).toBe(0);
  });

  it('sorts by value and by label', () => {
    const data = [['b', '2'], ['a10', '3'], ['a9', '1']];
    expect(buildSeries(data, { ...base, sort: 'value-desc' }).points.map(p => p.label)).toEqual(['a10', 'b', 'a9']);
    expect(buildSeries(data, { ...base, sort: 'value-asc' }).points.map(p => p.label)).toEqual(['a9', 'b', 'a10']);
    expect(buildSeries(data, { ...base, sort: 'label' }).points.map(p => p.label)).toEqual(['a9', 'a10', 'b']);
  });

  it('limits to top-N after sorting', () => {
    const data = [['a', '1'], ['b', '5'], ['c', '3'], ['d', '4']];
    const r = buildSeries(data, { ...base, sort: 'value-desc', topN: 2 });
    expect(r.points.map(p => p.label)).toEqual(['b', 'd']);
    expect(r.truncated).toBe(2);
  });

  it('folds the remainder into an Other bucket', () => {
    const data = [['a', '1'], ['b', '5'], ['c', '3'], ['d', '4']];
    const r = buildSeries(data, { ...base, sort: 'value-desc', topN: 2, other: true });
    expect(r.points).toEqual([{ label: 'b', v0: 5 }, { label: 'd', v0: 4 }, { label: OTHER_LABEL, v0: 4 }]);
  });

  it('does not add Other when everything fits', () => {
    const r = buildSeries([['a', '1']], { ...base, topN: 5, other: true });
    expect(r.points).toEqual([{ label: 'a', v0: 1 }]);
    expect(r.truncated).toBe(0);
  });

  it('drops non-positive values for pie charts and reports them', () => {
    const r = buildSeries([['a', '1'], ['b', '0'], ['c', '-2']], { ...base, positiveOnly: true });
    expect(r.points.map(p => p.label)).toEqual(['a']);
    expect(r.nonPositive).toBe(2);
  });
});

describe('sortPoints', () => {
  it('puts null values last and is stable', () => {
    const pts = [{ label: 'a', v0: null }, { label: 'b', v0: 1 }, { label: 'c', v0: 1 }];
    expect(sortPoints(pts, 'v0', 'value-desc').map(p => p.label)).toEqual(['b', 'c', 'a']);
    expect(sortPoints(pts, 'v0', 'value-asc').map(p => p.label)).toEqual(['b', 'c', 'a']);
  });
});
