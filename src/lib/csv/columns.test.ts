import { describe, expect, it } from 'vitest';
import { applyColumnSpecs, columnDisplayName, initialColumnSpecs, joinColumns, splitColumn } from './columns';

const grid = [
  ['first', 'last', 'city'],
  ['Ann', 'Lee', 'Paris'],
  ['Bob', '', 'Rome'],
];

describe('column specs', () => {
  it('starts with every column kept, named from the header', () => {
    expect(initialColumnSpecs(grid, true)).toEqual([
      { source: 0, keep: true, name: 'first' },
      { source: 1, keep: true, name: 'last' },
      { source: 2, keep: true, name: 'city' },
    ]);
    expect(initialColumnSpecs(grid, false)[0].name).toBe('');
  });

  it('labels blank or header-less columns by letter', () => {
    expect(columnDisplayName([['', 'b']], 0, true)).toBe('Column A');
    expect(columnDisplayName([['a', 'b']], 1, false)).toBe('Column B');
    expect(columnDisplayName([['a', 'b']], 1, true)).toBe('b');
  });

  it('reorders, drops and renames', () => {
    const specs = [
      { source: 2, keep: true, name: 'Town' },
      { source: 1, keep: false, name: 'last' },
      { source: 0, keep: true, name: 'first' },
    ];
    expect(applyColumnSpecs(grid, specs, true)).toEqual([
      ['Town', 'first'],
      ['Paris', 'Ann'],
      ['Rome', 'Bob'],
    ]);
  });

  it('ignores names when there is no header row', () => {
    const specs = [{ source: 1, keep: true, name: 'ignored' }, { source: 0, keep: true, name: '' }];
    expect(applyColumnSpecs(grid, specs, false)[0]).toEqual(['last', 'first']);
  });

  it('can drop every column', () => {
    const specs = initialColumnSpecs(grid, true).map(s => ({ ...s, keep: false }));
    expect(applyColumnSpecs(grid, specs, true)).toEqual([[], [], []]);
  });
});

describe('splitColumn', () => {
  const rows = [['id', 'name', 'x'], ['1', 'Ann Marie Lee', 'a'], ['2', 'Bob', 'b'], ['3', '', 'c']];

  it('splits into as many columns as the longest value, padding short ones', () => {
    expect(splitColumn(rows, { column: 1, separator: ' ', keepOriginal: false, header: true })).toEqual([
      ['id', 'name 1', 'name 2', 'name 3', 'x'],
      ['1', 'Ann', 'Marie', 'Lee', 'a'],
      ['2', 'Bob', '', '', 'b'],
      ['3', '', '', '', 'c'],
    ]);
  });

  it('keeps the original column when asked', () => {
    const out = splitColumn([['n'], ['a-b']], { column: 0, separator: '-', keepOriginal: true, header: true });
    expect(out).toEqual([['n', 'n 1', 'n 2'], ['a-b', 'a', 'b']]);
  });

  it('splits the first row too without a header', () => {
    const out = splitColumn([['a|b'], ['c']], { column: 0, separator: '|', keepOriginal: false, header: false });
    expect(out).toEqual([['a', 'b'], ['c', '']]);
  });

  it('supports multi-character separators and does not trim parts', () => {
    const out = splitColumn([['h'], ['a, b,c']], { column: 0, separator: ', ', keepOriginal: false, header: true });
    expect(out).toEqual([['h 1', 'h 2'], ['a', 'b,c']]);
  });

  it('names parts by column letter when the header cell is blank', () => {
    const out = splitColumn([['', 'h'], ['a b', 'x']], { column: 0, separator: ' ', keepOriginal: false, header: true });
    expect(out[0]).toEqual(['Column A 1', 'Column A 2', 'h']);
  });

  it('is a no-op for an empty separator or missing column', () => {
    expect(splitColumn(rows, { column: 1, separator: '', keepOriginal: false, header: true })).toBe(rows);
    expect(splitColumn(rows, { column: 9, separator: ' ', keepOriginal: false, header: true })).toBe(rows);
  });
});

describe('joinColumns', () => {
  it('joins in the chosen order and replaces the originals at the left-most position', () => {
    const out = joinColumns(grid, {
      columns: [1, 0], separator: ', ', name: 'full', keepOriginals: false, skipEmpty: false, header: true,
    });
    expect(out).toEqual([
      ['full', 'city'],
      ['Lee, Ann', 'Paris'],
      [', Bob', 'Rome'],
    ]);
  });

  it('skips empty values when asked', () => {
    const out = joinColumns(grid, {
      columns: [0, 1], separator: ' ', name: 'full', keepOriginals: false, skipEmpty: true, header: true,
    });
    expect(out.map(r => r[0])).toEqual(['full', 'Ann Lee', 'Bob']);
  });

  it('keeps originals and inserts after the right-most joined column', () => {
    const out = joinColumns(grid, {
      columns: [0, 2], separator: '/', name: 'fc', keepOriginals: true, skipEmpty: false, header: true,
    });
    expect(out[0]).toEqual(['first', 'last', 'city', 'fc']);
    expect(out[1]).toEqual(['Ann', 'Lee', 'Paris', 'Ann/Paris']);
  });

  it('joins the first row too without a header', () => {
    const out = joinColumns([['a', 'b']], {
      columns: [0, 1], separator: '-', name: 'ignored', keepOriginals: false, skipEmpty: false, header: false,
    });
    expect(out).toEqual([['a-b']]);
  });

  it('needs at least two valid columns', () => {
    const opts = { separator: '', name: 'x', keepOriginals: false, skipEmpty: false, header: true };
    expect(joinColumns(grid, { ...opts, columns: [0] })).toBe(grid);
    expect(joinColumns(grid, { ...opts, columns: [0, 7] })).toBe(grid);
  });
});
