import { describe, expect, it } from 'vitest';
import { padGridInPlace, parseLargeCsv, readLargeCsvFile } from './largeCsv';

describe('parseLargeCsv', () => {
  it('parses 300k rows without overflowing the stack', () => {
    const text = ['a,b', ...Array.from({ length: 300_000 }, (_, i) => `${i},x`)].join('\n');
    const { rows, delimiter } = parseLargeCsv(text);
    expect(rows).toHaveLength(300_001);
    expect(rows[300_000]).toEqual(['299999', 'x']);
    expect(delimiter).toBe(',');
  });

  it('pads ragged rows, strips a BOM and detects tabs', () => {
    expect(parseLargeCsv('\uFEFFa\tb\tc\n1').rows).toEqual([['a', 'b', 'c'], ['1', '', '']]);
    expect(parseLargeCsv('a\tb\n1\t2').delimiter).toBe('\t');
  });

  it('returns a single empty cell for empty input', () => {
    expect(parseLargeCsv('').rows).toEqual([['']]);
  });
});

describe('padGridInPlace', () => {
  it('pads to the widest row', () => {
    expect(padGridInPlace([['a'], ['b', 'c']])).toEqual([['a', ''], ['b', 'c']]);
  });
});

describe('readLargeCsvFile', () => {
  it('rejects empty and oversized files', async () => {
    await expect(readLargeCsvFile(new File(['  \n'], 'e.csv'), 100)).rejects.toThrow('That file is empty.');
    await expect(readLargeCsvFile(new File(['a,b\n1,2'], 'big.csv'), 3)).rejects.toThrow(/the limit is/);
  });

  it('parses a valid file', async () => {
    const { rows } = await readLargeCsvFile(new File(['a,b\n1,2'], 'ok.csv'), 1000);
    expect(rows).toEqual([['a', 'b'], ['1', '2']]);
  });
});
