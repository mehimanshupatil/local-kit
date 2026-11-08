import { describe, expect, it } from 'vitest';
import { MAX_SPLIT_FILES, countSplitParts, safeFilePart, splitCsv, uniqueFileNames } from './split';
import { parseCsv } from './csv';

const people = [
  ['name', 'city'],
  ['Ann', 'Paris'],
  ['Bob', 'Oslo'],
  ['Cy', 'Paris'],
  ['Di', ''],
  ['Ed', 'Oslo'],
];

describe('safeFilePart', () => {
  it('replaces path separators, reserved characters and whitespace with dashes', () => {
    expect(safeFilePart('Q1 / Sales: "North"')).toBe('Q1-Sales-North');
    expect(safeFilePart('a\\b*c?d<e>f|g')).toBe('a-b-c-d-e-f-g');
  });

  it('names blank and whitespace-only values "empty"', () => {
    expect(safeFilePart('')).toBe('empty');
    expect(safeFilePart('   ')).toBe('empty');
  });

  it('falls back to "value" when nothing usable is left', () => {
    expect(safeFilePart('???')).toBe('value');
    expect(safeFilePart('..')).toBe('value');
  });

  it('strips leading/trailing dots and dashes, keeps unicode and truncates', () => {
    expect(safeFilePart('.hidden.')).toBe('hidden');
    expect(safeFilePart('Zürich')).toBe('Zürich');
    expect(safeFilePart('x'.repeat(100))).toHaveLength(60);
  });
});

describe('uniqueFileNames', () => {
  it('suffixes collisions before the extension, case-insensitively', () => {
    expect(uniqueFileNames(['a.csv', 'A.csv', 'a.csv', 'b.csv'])).toEqual(['a.csv', 'A-2.csv', 'a-3.csv', 'b.csv']);
  });

  it('does not reuse a name that already exists literally', () => {
    expect(uniqueFileNames(['a.csv', 'a-2.csv', 'a.csv'])).toEqual(['a.csv', 'a-2.csv', 'a-3.csv']);
  });
});

describe('splitCsv by rows', () => {
  it('chunks data rows and repeats the header in every part', () => {
    const parts = splitCsv(people, 'people', { mode: 'rows', rowsPerFile: 2, hasHeader: true, repeatHeader: true });
    expect(parts.map(p => p.name)).toEqual(['people-part-001.csv', 'people-part-002.csv', 'people-part-003.csv']);
    expect(parts[0].rows).toEqual([['name', 'city'], ['Ann', 'Paris'], ['Bob', 'Oslo']]);
    expect(parts[2].rows).toEqual([['name', 'city'], ['Ed', 'Oslo']]);
  });

  it('puts the header only in the first part when repeatHeader is off', () => {
    const parts = splitCsv(people, 'p', { mode: 'rows', rowsPerFile: 2, hasHeader: true, repeatHeader: false });
    expect(parts[0].rows[0]).toEqual(['name', 'city']);
    expect(parts[1].rows).toEqual([['Cy', 'Paris'], ['Di', '']]);
  });

  it('treats every row as data when there is no header', () => {
    const parts = splitCsv(people, 'p', { mode: 'rows', rowsPerFile: 3, hasHeader: false, repeatHeader: true });
    expect(parts).toHaveLength(2);
    expect(parts[0].rows[0]).toEqual(['name', 'city']);
    expect(parts[1].rows).toHaveLength(3);
  });

  it('widens the counter past 999 parts', () => {
    const rows = [['h'], ...Array.from({ length: 1000 }, (_, i) => [String(i)])];
    const parts = splitCsv(rows, 'x', { mode: 'rows', rowsPerFile: 1, hasHeader: true, repeatHeader: true });
    expect(parts[0].name).toBe('x-part-0001.csv');
    expect(parts[999].name).toBe('x-part-1000.csv');
  });

  it('clamps a zero or fractional chunk size to at least 1', () => {
    expect(countSplitParts(people, { mode: 'rows', rowsPerFile: 0, hasHeader: true, repeatHeader: true })).toBe(5);
    expect(countSplitParts(people, { mode: 'rows', rowsPerFile: 2.7, hasHeader: true, repeatHeader: true })).toBe(3);
  });

  it('refuses a header-only file', () => {
    expect(() => splitCsv([['a', 'b']], 'x', { mode: 'rows', rowsPerFile: 1, hasHeader: true, repeatHeader: true }))
      .toThrow('no data rows');
  });
});

describe('splitCsv by column', () => {
  it('creates one file per distinct value in first-seen order, blanks grouped as "empty"', () => {
    const parts = splitCsv(people, 'people', { mode: 'column', column: 1, hasHeader: true });
    expect(parts.map(p => p.name)).toEqual(['people-Paris.csv', 'people-Oslo.csv', 'people-empty.csv']);
    expect(parts[0].rows).toEqual([['name', 'city'], ['Ann', 'Paris'], ['Cy', 'Paris']]);
    expect(parts[2].rows).toEqual([['name', 'city'], ['Di', '']]);
  });

  it('groups whitespace-only values with blanks and handles ragged rows', () => {
    const { rows } = parseCsv('id,tag\n1,x\n2,  \n3\n4,x');
    const parts = splitCsv(rows, 'f', { mode: 'column', column: 1, hasHeader: true });
    expect(parts.map(p => [p.name, p.rows.length - 1])).toEqual([['f-x.csv', 2], ['f-empty.csv', 2]]);
  });

  it('treats a column index beyond a short row as blank', () => {
    const parts = splitCsv([['h1', 'h2'], ['a']], 'f', { mode: 'column', column: 1, hasHeader: true });
    expect(parts[0].name).toBe('f-empty.csv');
  });

  it('de-duplicates names that collide after sanitising', () => {
    const rows = [['v'], ['a/b'], ['a:b'], ['A b'], ['empty'], ['']];
    const parts = splitCsv(rows, 'f', { mode: 'column', column: 0, hasHeader: true });
    expect(parts.map(p => p.name)).toEqual(['f-a-b.csv', 'f-a-b-2.csv', 'f-A-b-3.csv', 'f-empty.csv', 'f-empty-2.csv']);
  });

  it('omits the header when the first row is data', () => {
    const parts = splitCsv(people, 'p', { mode: 'column', column: 1, hasHeader: false });
    expect(parts[0].name).toBe('p-city.csv');
    expect(parts[0].rows).toEqual([['name', 'city']]);
  });

  it(`refuses more than ${MAX_SPLIT_FILES} files with a clear message`, () => {
    const rows = [['id'], ...Array.from({ length: MAX_SPLIT_FILES + 1 }, (_, i) => [String(i)])];
    const config = { mode: 'column', column: 0, hasHeader: true } as const;
    expect(countSplitParts(rows, config)).toBe(1001);
    expect(() => splitCsv(rows, 'f', config)).toThrow('1,001 files — the limit is 1,000');
  });
});
