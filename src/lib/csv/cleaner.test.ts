import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CLEAN_OPTIONS, applyCase, cleanGrid, collapseSpaces, replaceInvisible, toTitleCase, type CleanOptions,
} from './cleaner';

const NONE: CleanOptions = {
  header: true,
  trim: false,
  collapseSpaces: false,
  invisible: false,
  removeEmptyRows: false,
  removeEmptyColumns: false,
  dedupe: false,
  dedupeIgnoreCase: false,
  textCase: 'none',
  caseColumn: null,
};

const ZWSP = String.fromCharCode(0x200b);
const NBSP = String.fromCharCode(0xa0);
const BOM = String.fromCharCode(0xfeff);
const ZWJ = String.fromCharCode(0x200d);

describe('cell helpers', () => {
  it('removes zero-width chars and BOMs and turns non-breaking spaces into spaces', () => {
    expect(replaceInvisible(`a${ZWSP}b${BOM}c${NBSP}d`)).toBe('abc d');
  });

  it('keeps zero-width joiners (emoji sequences) and normal whitespace', () => {
    expect(replaceInvisible(`x${ZWJ}y\tz\nw`)).toBe(`x${ZWJ}y\tz\nw`);
  });

  it('strips control characters', () => {
    expect(replaceInvisible('a\u0000b\u0007c')).toBe('abc');
  });

  it('collapses runs of spaces and tabs but keeps line breaks', () => {
    expect(collapseSpaces('a   b\t\tc\n\nd')).toBe('a b c\n\nd');
    expect(collapseSpaces('a b')).toBe('a b');
  });

  it('title-cases words, keeping apostrophes inside words', () => {
    expect(toTitleCase("o'NEILL don't STOP-me now")).toBe("O'neill Don't Stop-Me Now");
    expect(toTitleCase('élan vital')).toBe('Élan Vital');
  });

  it('applies the chosen case', () => {
    expect(applyCase('MiXed', 'lower')).toBe('mixed');
    expect(applyCase('MiXed', 'upper')).toBe('MIXED');
    expect(applyCase('MiXed', 'none')).toBe('MiXed');
  });
});

describe('cleanGrid', () => {
  it('trims, collapses and replaces invisible chars, counting changed cells', () => {
    const res = cleanGrid([['  name ', 'city'], [`Ann${ZWSP}`, `New${NBSP}${NBSP}York`], ['Bob', 'Paris']], {
      ...NONE, trim: true, collapseSpaces: true, invisible: true,
    });
    expect(res.rows).toEqual([['name', 'city'], ['Ann', 'New York'], ['Bob', 'Paris']]);
    expect(res.cellsChanged).toBe(3);
    expect(res.rowsRemoved).toBe(0);
    expect(res.columnsRemoved).toBe(0);
  });

  it('removes rows that are empty after cleaning', () => {
    const res = cleanGrid([['a', 'b'], ['  ', ''], ['1', '2'], ['', '']], { ...NONE, trim: true, removeEmptyRows: true });
    expect(res.rows).toEqual([['a', 'b'], ['1', '2']]);
    expect(res.rowsRemoved).toBe(2);
  });

  it('never removes an empty header row', () => {
    const res = cleanGrid([['', ''], ['1', '2']], { ...NONE, removeEmptyRows: true });
    expect(res.rows).toEqual([['', ''], ['1', '2']]);
  });

  it('removes an empty first row when there is no header', () => {
    const res = cleanGrid([['', ''], ['1', '2']], { ...NONE, header: false, removeEmptyRows: true });
    expect(res.rows).toEqual([['1', '2']]);
  });

  it('removes columns that are empty in every row, including the header', () => {
    const res = cleanGrid([['a', '', 'c', 'd'], ['1', '', '3', '']], { ...NONE, removeEmptyColumns: true });
    expect(res.rows).toEqual([['a', 'c', 'd'], ['1', '3', '']]);
    expect(res.columnsRemoved).toBe(1);
  });

  it('keeps one column when everything is empty', () => {
    const res = cleanGrid([['', ''], ['', '']], { ...NONE, removeEmptyColumns: true });
    expect(res.rows).toEqual([[''], ['']]);
    expect(res.columnsRemoved).toBe(1);
  });

  it('dedupes after whitespace cleanup and keeps the first occurrence', () => {
    const res = cleanGrid([['k', 'v'], ['a', '1'], [' a ', '1'], ['b', '2'], ['a', '1']], {
      ...NONE, trim: true, dedupe: true,
    });
    expect(res.rows).toEqual([['k', 'v'], ['a', '1'], ['b', '2']]);
    expect(res.rowsRemoved).toBe(2);
  });

  it('dedupe is case-sensitive unless asked otherwise', () => {
    const grid = [['k'], ['Ann'], ['ANN']];
    expect(cleanGrid(grid, { ...NONE, dedupe: true }).rows).toEqual(grid);
    expect(cleanGrid(grid, { ...NONE, dedupe: true, dedupeIgnoreCase: true }).rows).toEqual([['k'], ['Ann']]);
  });

  it('never treats a data row as a duplicate of the header', () => {
    const res = cleanGrid([['a', 'b'], ['a', 'b']], { ...NONE, dedupe: true });
    expect(res.rows).toEqual([['a', 'b'], ['a', 'b']]);
  });

  it('dedupes the first row too when there is no header', () => {
    const res = cleanGrid([['a', 'b'], ['a', 'b']], { ...NONE, header: false, dedupe: true });
    expect(res.rows).toEqual([['a', 'b']]);
  });

  it('does not join cells when building the dedupe key', () => {
    const res = cleanGrid([['h', 'h'], ['a,b', 'c'], ['a', 'b,c']], { ...NONE, dedupe: true });
    expect(res.rows).toHaveLength(3);
  });

  it('changes case in all data cells but leaves the header alone', () => {
    const res = cleanGrid([['Name', 'City'], ['ann lee', 'PARIS']], { ...NONE, textCase: 'title' });
    expect(res.rows).toEqual([['Name', 'City'], ['Ann Lee', 'Paris']]);
    expect(res.cellsChanged).toBe(2);
  });

  it('changes case in only the chosen column', () => {
    const res = cleanGrid([['Name', 'City'], ['ann', 'paris']], { ...NONE, textCase: 'upper', caseColumn: 1 });
    expect(res.rows).toEqual([['Name', 'City'], ['ann', 'PARIS']]);
  });

  it('re-cases the first row when there is no header', () => {
    const res = cleanGrid([['a'], ['b']], { ...NONE, header: false, textCase: 'upper' });
    expect(res.rows).toEqual([['A'], ['B']]);
  });

  it('runs with the default options end to end', () => {
    const res = cleanGrid(
      [[' id ', 'name', ''], ['1', ' Ann  Lee ', ''], ['', '', ''], ['1', 'Ann Lee', '']],
      DEFAULT_CLEAN_OPTIONS,
    );
    expect(res.rows).toEqual([['id', 'name'], ['1', 'Ann Lee']]);
    expect(res.rowsRemoved).toBe(2);
    expect(res.columnsRemoved).toBe(1);
  });

  it('does not mutate its input', () => {
    const grid = [['  a '], ['  b ']];
    cleanGrid(grid, DEFAULT_CLEAN_OPTIONS);
    expect(grid).toEqual([['  a '], ['  b ']]);
  });
});
