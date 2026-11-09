import { describe, expect, it } from 'vitest';
import { clearRange, fillDown, inRange, isMultiCell, rangeBetween, rangeToTsv } from './selection';

const grid = [['a', 'b', 'c'], ['d', 'e', 'f'], ['g', 'h', 'i']];

describe('rangeBetween', () => {
  it('normalises any two corners to top-left → bottom-right', () => {
    expect(rangeBetween({ r: 2, c: 0 }, { r: 0, c: 1 })).toEqual({ top: 0, left: 0, bottom: 2, right: 1 });
  });
});

describe('inRange / isMultiCell', () => {
  const range = rangeBetween({ r: 0, c: 1 }, { r: 1, c: 2 });
  it('checks membership inclusively', () => {
    expect(inRange(range, 1, 2)).toBe(true);
    expect(inRange(range, 2, 2)).toBe(false);
  });
  it('distinguishes single cells', () => {
    expect(isMultiCell(range)).toBe(true);
    expect(isMultiCell(rangeBetween({ r: 1, c: 1 }, { r: 1, c: 1 }))).toBe(false);
  });
});

describe('rangeToTsv', () => {
  it('copies the range as tab-separated rows', () => {
    expect(rangeToTsv(grid, rangeBetween({ r: 0, c: 1 }, { r: 1, c: 2 }))).toBe('b\tc\ne\tf');
  });
  it('quotes cells containing tabs or newlines so spreadsheets paste them back intact', () => {
    expect(rangeToTsv([['x\ty', 'line1\nline2']], rangeBetween({ r: 0, c: 0 }, { r: 0, c: 1 }))).toBe('"x\ty"\t"line1\nline2"');
  });
});

describe('clearRange', () => {
  it('empties only the cells in the range', () => {
    expect(clearRange(grid, rangeBetween({ r: 1, c: 1 }, { r: 2, c: 2 }))).toEqual([['a', 'b', 'c'], ['d', '', ''], ['g', '', '']]);
  });
});

describe('fillDown', () => {
  it('repeats the top row of the range into the rows below', () => {
    expect(fillDown(grid, rangeBetween({ r: 0, c: 0 }, { r: 2, c: 1 }))).toEqual([['a', 'b', 'c'], ['a', 'b', 'f'], ['a', 'b', 'i']]);
  });
});
