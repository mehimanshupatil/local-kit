import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CSV_OPTIONS, columnLabel, deleteCol, headerNames, deleteRow, insertCol, insertRow, moveCol, moveRow,
  normalizeGrid, parseClipboardTable, parseCsv, pasteIntoGrid, serializeCsv, trimGrid,
} from './csv';

describe('serializeCsv', () => {
  it('leaves plain fields unquoted and joins rows with CRLF by default', () => {
    expect(serializeCsv([['a', 'b'], ['1', '2']])).toBe('a,b\r\n1,2');
  });

  it('quotes fields containing the delimiter, quotes or newlines, doubling inner quotes', () => {
    expect(serializeCsv([['a,b', 'say "hi"', 'line1\nline2']])).toBe('"a,b","say ""hi""","line1\nline2"');
  });

  it('only quotes for the active delimiter', () => {
    const opts = { ...DEFAULT_CSV_OPTIONS, delimiter: ';' as const };
    expect(serializeCsv([['a,b', 'c;d']], opts)).toBe('a,b;"c;d"');
  });

  it('quotes everything when quoteAll is set', () => {
    expect(serializeCsv([['a', '']], { ...DEFAULT_CSV_OPTIONS, quoteAll: true })).toBe('"a",""');
  });

  it('uses LF when asked', () => {
    expect(serializeCsv([['a'], ['b']], { ...DEFAULT_CSV_OPTIONS, lineEnding: '\n' })).toBe('a\nb');
  });
});

describe('parseCsv', () => {
  it('round-trips quoted fields produced by serializeCsv', () => {
    const rows = [['name', 'note'], ['Ann', 'said "yes", then\nleft']];
    expect(parseCsv(serializeCsv(rows)).rows).toEqual(rows);
  });

  it('detects semicolon and tab delimiters', () => {
    expect(parseCsv('a;b\n1;2').delimiter).toBe(';');
    expect(parseCsv('a\tb\n1\t2').delimiter).toBe('\t');
  });

  it('strips a leading BOM so the first header is clean', () => {
    expect(parseCsv('\uFEFFid,name\n1,x').rows[0][0]).toBe('id');
  });

  it('pads ragged rows to a rectangle', () => {
    expect(parseCsv('a,b,c\n1').rows).toEqual([['a', 'b', 'c'], ['1', '', '']]);
  });

  it('returns a single empty cell for empty input', () => {
    expect(parseCsv('').rows).toEqual([['']]);
  });
});

describe('parseClipboardTable', () => {
  it('splits Excel/Sheets tab-separated rows and drops the trailing newline', () => {
    expect(parseClipboardTable('a\tb\r\n1\t2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('keeps quoted multi-line cells from Google Sheets intact', () => {
    expect(parseClipboardTable('"x\ny"\tz')).toEqual([['x\ny', 'z']]);
  });

  it('treats plain text as a single cell, commas and all', () => {
    expect(parseClipboardTable('hello, world')).toEqual([['hello, world']]);
  });
});

describe('pasteIntoGrid', () => {
  it('overwrites cells in place', () => {
    expect(pasteIntoGrid([['', ''], ['', '']], [['x']], 1, 1)).toEqual([['', ''], ['', 'x']]);
  });

  it('grows rows and columns to fit the pasted block', () => {
    expect(pasteIntoGrid([['a']], [['1', '2'], ['3', '4']], 0, 1)).toEqual([['a', '1', '2'], ['', '3', '4']]);
  });

  it('does not mutate the source grid', () => {
    const grid = [['a']];
    pasteIntoGrid(grid, [['b']], 0, 0);
    expect(grid).toEqual([['a']]);
  });
});

describe('row and column ops', () => {
  const grid = [['a', 'b'], ['c', 'd']];

  it('inserts and deletes rows', () => {
    expect(insertRow(grid, 1)).toEqual([['a', 'b'], ['', ''], ['c', 'd']]);
    expect(deleteRow(grid, 0)).toEqual([['c', 'd']]);
  });

  it('inserts and deletes columns', () => {
    expect(insertCol(grid, 0)).toEqual([['', 'a', 'b'], ['', 'c', 'd']]);
    expect(deleteCol(grid, 1)).toEqual([['a'], ['c']]);
  });

  it('never deletes the last row or column, clearing it instead', () => {
    expect(deleteRow([['a', 'b']], 0)).toEqual([['', '']]);
    expect(deleteCol([['a'], ['b']], 0)).toEqual([[''], ['']]);
  });

  it('moves rows and columns, ignoring out-of-range targets', () => {
    expect(moveRow(grid, 0, 1)).toEqual([['c', 'd'], ['a', 'b']]);
    expect(moveCol(grid, 1, 0)).toEqual([['b', 'a'], ['d', 'c']]);
    expect(moveRow(grid, 0, -1)).toBe(grid);
    expect(moveCol(grid, 1, 2)).toBe(grid);
  });
});

describe('trimGrid', () => {
  it('drops trailing empty rows and columns', () => {
    expect(trimGrid([['a', '', ''], ['', 'b', ''], ['', '', '']])).toEqual([['a', ''], ['', 'b']]);
  });

  it('keeps interior blanks', () => {
    expect(trimGrid([['a', '', 'c'], ['', '', ''], ['d', '', '']])).toEqual([['a', '', 'c'], ['', '', ''], ['d', '', '']]);
  });

  it('keeps one cell for an all-empty grid', () => {
    expect(trimGrid([['', ''], ['', '']])).toEqual([['']]);
  });
});

describe('normalizeGrid', () => {
  it('respects a minimum column count', () => {
    expect(normalizeGrid([['a']], 3)).toEqual([['a', '', '']]);
  });
});

describe('columnLabel', () => {
  it('produces spreadsheet column letters', () => {
    expect([0, 25, 26, 51, 701, 702].map(columnLabel)).toEqual(['A', 'Z', 'AA', 'AZ', 'ZZ', 'AAA']);
  });
});

describe('headerNames', () => {
  it('uses header cells and falls back to column letters for blanks', () => {
    expect(headerNames([['id', ' ', 'name'], ['1', '2', '3']])).toEqual(['id', 'Column B', 'name']);
  });

  it('returns nothing for an empty grid', () => {
    expect(headerNames([])).toEqual([]);
  });
});
