import { describe, expect, it } from 'vitest';
import { alignColumns, cellText, commonColumns, diffCsv, diffReport, type DiffOptions } from './diff';
import { parseCsv } from './csv';

const opts = (o: Partial<DiffOptions> = {}): DiffOptions => ({
  hasHeader: true, key: 0, ignoreCase: false, trim: false, ...o,
});

const original = [
  ['id', 'name', 'city'],
  ['1', 'Ann', 'Paris'],
  ['2', 'Bob', 'Oslo'],
  ['3', 'Cy', 'Rome'],
];
const changed = [
  ['ID', 'name', 'city'],
  ['1', 'Ann', 'Paris'],
  ['3', 'Cy', 'Milan'],
  ['4', 'Di', 'Lima'],
];

describe('alignColumns', () => {
  it('matches columns by trimmed, case-insensitive header and appends changed-only columns', () => {
    const cols = alignColumns([['id', 'Old', ' Name']], [['name', 'ID', 'new']], true);
    expect(cols).toEqual([
      { name: 'id', original: 0, changed: 1 },
      { name: 'Old', original: 1, changed: null },
      { name: 'Name', original: 2, changed: 0 },
      { name: 'new', original: null, changed: 2 },
    ]);
    expect(commonColumns(cols)).toEqual([0, 2]);
  });

  it('aligns by position without a header', () => {
    expect(alignColumns([['a', 'b', 'c']], [['x']], false).map(c => [c.name, c.original, c.changed]))
      .toEqual([['Column A', 0, 0], ['Column B', 1, null], ['Column C', 2, null]]);
  });
});

describe('diffCsv by key', () => {
  it('classifies added, removed, changed and unchanged rows in reading order', () => {
    const r = diffCsv(original, changed, opts());
    expect(r.counts).toEqual({ added: 1, removed: 1, changed: 1, unchanged: 1 });
    expect(r.rows.map(row => [row.status, row.cells[0].old ?? row.cells[0].new])).toEqual([
      ['unchanged', '1'], ['removed', '2'], ['changed', '3'], ['added', '4'],
    ]);
    const cy = r.rows[2];
    expect(cy.cells[2]).toEqual({ old: 'Rome', new: 'Milan', changed: true });
    expect(cy.cells[1]).toEqual({ old: 'Cy', new: 'Cy', changed: false });
  });

  it('matches rows regardless of their order', () => {
    const shuffled = [changed[0], changed[3], changed[2], changed[1]];
    const r = diffCsv(original, shuffled, opts());
    expect(r.counts).toEqual({ added: 1, removed: 1, changed: 1, unchanged: 1 });
  });

  it('reports columns present in only one file and ignores them when comparing', () => {
    const a = [['id', 'v', 'gone'], ['1', 'x', 'q']];
    const b = [['id', 'v', 'fresh'], ['1', 'x', 'z']];
    const r = diffCsv(a, b, opts());
    expect(r.onlyInOriginal).toEqual(['gone']);
    expect(r.onlyInChanged).toEqual(['fresh']);
    expect(r.counts.unchanged).toBe(1);
    expect(r.rows[0].cells.map(cellText)).toEqual(['1', 'x', 'q', 'z']);
  });

  it('honours ignoreCase and trim, for values and keys', () => {
    const a = [['k', 'v'], ['A', 'Hello ']];
    const b = [['k', 'v'], [' a', 'hello']];
    expect(diffCsv(a, b, opts()).counts).toMatchObject({ added: 1, removed: 1 });
    expect(diffCsv(a, b, opts({ trim: true })).counts).toMatchObject({ added: 1, removed: 1 });
    expect(diffCsv(a, b, opts({ trim: true, ignoreCase: true })).counts).toEqual({ added: 0, removed: 0, changed: 0, unchanged: 1 });
    const caseOnly = diffCsv([['k', 'v'], ['1', 'X']], [['k', 'v'], ['1', 'x']], opts({ ignoreCase: true }));
    expect(caseOnly.counts.unchanged).toBe(1);
  });

  it('warns about duplicate keys and matches only the first occurrence', () => {
    const a = [['id', 'v'], ['1', 'a'], ['1', 'b'], ['2', 'c']];
    const b = [['id', 'v'], ['1', 'a'], ['2', 'c'], ['2', 'd']];
    const r = diffCsv(a, b, opts());
    expect(r.duplicateKeys).toEqual({ original: ['1'], changed: ['2'] });
    expect(r.rows.map(x => x.status)).toEqual(['unchanged', 'removed', 'unchanged', 'added']);
    expect(r.rows[1].cells[1].old).toBe('b');
    expect(r.rows[3].cells[1].new).toBe('d');
  });

  it('cannot match rows with a blank key, and counts them', () => {
    const a = [['id', 'v'], ['', 'x'], ['1', 'y']];
    const b = [['id', 'v'], ['  ', 'x'], ['1', 'y']];
    const r = diffCsv(a, b, opts());
    expect(r.blankKeys).toEqual({ original: 1, changed: 1 });
    expect(r.counts).toEqual({ added: 1, removed: 1, changed: 0, unchanged: 1 });
  });

  it('handles ragged rows as blank cells', () => {
    const a = parseCsv('id,v,w\n1,x').rows;
    const b = parseCsv('id,v,w\n1,x,').rows;
    expect(diffCsv(a, b, opts()).counts.unchanged).toBe(1);
    const c = [['id', 'v', 'w'], ['1']];
    expect(diffCsv(a, c, opts()).counts.changed).toBe(1);
  });

  it('rejects a key column missing from one file', () => {
    expect(() => diffCsv([['a', 'b'], ['1', '2']], [['a'], ['1']], opts({ key: 1 }))).toThrow('both files');
  });
});

describe('diffCsv by position', () => {
  it('compares row N with row N and reports extra rows', () => {
    const r = diffCsv(original, changed, opts({ key: 'position' }));
    expect(r.rows.map(x => x.status)).toEqual(['unchanged', 'changed', 'changed']);
    const longer = diffCsv(original, [...changed, ['5', 'Ed', 'Kyiv']], opts({ key: 'position' }));
    expect(longer.counts.added).toBe(1);
    const shorter = diffCsv(original, changed.slice(0, 2), opts({ key: 'position' }));
    expect(shorter.counts).toEqual({ added: 0, removed: 2, changed: 0, unchanged: 1 });
  });

  it('works without a header row', () => {
    const r = diffCsv([['1', 'a'], ['2', 'b']], [['1', 'a'], ['2', 'c']], opts({ hasHeader: false, key: 'position' }));
    expect(r.columns.map(c => c.name)).toEqual(['Column A', 'Column B']);
    expect(r.counts).toEqual({ added: 0, removed: 0, changed: 1, unchanged: 1 });
  });

  it('can key on a column without a header row', () => {
    const r = diffCsv([['1', 'a'], ['2', 'b']], [['2', 'b'], ['1', 'z']], opts({ hasHeader: false, key: 0 }));
    expect(r.counts).toEqual({ added: 0, removed: 0, changed: 1, unchanged: 1 });
  });
});

describe('diffReport', () => {
  it('flattens to status + columns with changed cells as "old → new"', () => {
    expect(diffReport(diffCsv(original, changed, opts()))).toEqual([
      ['status', 'id', 'name', 'city'],
      ['unchanged', '1', 'Ann', 'Paris'],
      ['removed', '2', 'Bob', 'Oslo'],
      ['changed', '3', 'Cy', 'Rome → Milan'],
      ['added', '4', 'Di', 'Lima'],
    ]);
  });
});
