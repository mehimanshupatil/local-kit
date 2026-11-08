import { describe, expect, it } from 'vitest';
import { DEFAULT_MERGE_OPTIONS, headerKeys, mergeCsvs, type MergeOptions } from './merge';
import { parseCsv } from './csv';

const opts = (o: Partial<MergeOptions> = {}): MergeOptions => ({ ...DEFAULT_MERGE_OPTIONS, ...o });

const a = { name: 'a.csv', rows: [['id', 'name'], ['1', 'Ann'], ['2', 'Bob']] };
const b = { name: 'b.csv', rows: [[' Name ', 'ID', 'email'], ['Cy', '3', 'cy@x'], ['Bob', '2', '']] };

describe('headerKeys', () => {
  it('trims, case-folds and numbers repeated headers', () => {
    expect(headerKeys([' Id', 'NAME', 'name', 'Name'])).toEqual(['id', 'name', 'name#2', 'name#3']);
  });

  it('keys blank headers by position', () => {
    const keys = headerKeys(['', 'x', '  ']);
    expect(keys[0]).not.toBe(keys[2]);
    expect(headerKeys(['', 'y', ' '])[2]).toBe(keys[2]);
  });
});

describe('mergeCsvs by header name', () => {
  it('unions headers in first-seen order and leaves missing cells blank', () => {
    const r = mergeCsvs([a, b], opts());
    expect(r.rows).toEqual([
      ['id', 'name', 'email'],
      ['1', 'Ann', ''],
      ['2', 'Bob', ''],
      ['3', 'Cy', 'cy@x'],
      ['2', 'Bob', ''],
    ]);
    expect(r.dataRows).toBe(4);
    expect(r.columns).toBe(3);
  });

  it('keeps the first-seen header spelling (trimmed)', () => {
    const r = mergeCsvs([b, a], opts());
    expect(r.rows[0]).toEqual(['Name', 'ID', 'email']);
    expect(r.rows[3]).toEqual(['Ann', '1', '']);
  });

  it('removes duplicate rows across files, keeping the first', () => {
    const r = mergeCsvs([a, b], opts({ dedupe: true }));
    expect(r.dataRows).toBe(3);
    expect(r.duplicatesRemoved).toBe(1);
    expect(r.rows.map(row => row[0])).toEqual(['id', '1', '2', '3']);
  });

  it('adds a source_file column and dedupes ignoring it', () => {
    const r = mergeCsvs([a, b], opts({ addSource: true, dedupe: true }));
    expect(r.rows[0]).toEqual(['id', 'name', 'email', 'source_file']);
    expect(r.rows[1]).toEqual(['1', 'Ann', '', 'a.csv']);
    expect(r.rows[3]).toEqual(['3', 'Cy', 'cy@x', 'b.csv']);
    expect(r.columns).toBe(4);
    expect(r.duplicatesRemoved).toBe(1);
  });

  it('matches repeated header names by occurrence', () => {
    const x = { name: 'x', rows: [['tag', 'tag'], ['a', 'b']] };
    const y = { name: 'y', rows: [['TAG', 'other', 'Tag'], ['c', 'o', 'd']] };
    expect(mergeCsvs([x, y], opts()).rows).toEqual([['tag', 'tag', 'other'], ['a', 'b', ''], ['c', 'd', 'o']]);
  });

  it('merges files parsed with different delimiters and ragged rows', () => {
    const comma = parseCsv('id,name\n1,Ann\n2');
    const semi = parseCsv('name;id;note\nCy;3;"a;b"');
    const r = mergeCsvs([{ name: 'c', rows: comma.rows }, { name: 's', rows: semi.rows }], opts());
    expect(r.rows).toEqual([['id', 'name', 'note'], ['1', 'Ann', ''], ['2', '', ''], ['3', 'Cy', 'a;b']]);
  });

  it('contributes header columns from a header-only file', () => {
    const r = mergeCsvs([a, { name: 'h', rows: [['zip']] }], opts());
    expect(r.rows[0]).toEqual(['id', 'name', 'zip']);
    expect(r.dataRows).toBe(2);
  });
});

describe('mergeCsvs by position', () => {
  it('stacks columns positionally using the first non-blank header', () => {
    const r = mergeCsvs([a, b], opts({ match: 'position' }));
    expect(r.rows).toEqual([
      ['id', 'name', 'email'],
      ['1', 'Ann', ''],
      ['2', 'Bob', ''],
      ['Cy', '3', 'cy@x'],
      ['Bob', '2', ''],
    ]);
  });

  it('treats every row as data without a header (and ignores "by name")', () => {
    const r = mergeCsvs([a, b], opts({ hasHeader: false, match: 'name', addSource: true }));
    expect(r.rows).toHaveLength(6);
    expect(r.rows[0]).toEqual(['id', 'name', '', 'a.csv']);
    expect(r.rows[3]).toEqual([' Name ', 'ID', 'email', 'b.csv']);
    expect(r.dataRows).toBe(6);
    expect(r.columns).toBe(4);
  });

  it('dedupes on whole rows without a header', () => {
    const r = mergeCsvs([{ name: 'x', rows: [['1'], ['2']] }, { name: 'y', rows: [['2'], ['3']] }], opts({ hasHeader: false, dedupe: true }));
    expect(r.rows).toEqual([['1'], ['2'], ['3']]);
  });
});
