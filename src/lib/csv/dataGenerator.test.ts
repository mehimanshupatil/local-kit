import { describe, expect, it } from 'vitest';
import { GENERATOR_TYPES, generateRows, mulberry32 } from './dataGenerator';

describe('generateRows', () => {
  it('emits a header row then the requested number of rows', () => {
    const rows = generateRows([{ name: 'id', type: 'sequence' }, { name: '', type: 'city' }], 5, mulberry32(1));
    expect(rows[0]).toEqual(['id', 'column_2']);
    expect(rows).toHaveLength(6);
    expect(rows.slice(1).map(r => r[0])).toEqual(['1', '2', '3', '4', '5']);
  });

  it('is reproducible for a given seed', () => {
    const specs = [{ name: 'n', type: 'fullName' as const }, { name: 'e', type: 'email' as const }];
    expect(generateRows(specs, 20, mulberry32(42))).toEqual(generateRows(specs, 20, mulberry32(42)));
  });

  it('keeps numbers inside the configured range', () => {
    const rows = generateRows([
      { name: 'i', type: 'integer', min: 5, max: 7 },
      { name: 'd', type: 'decimal', min: 1, max: 2 },
    ], 200, mulberry32(7)).slice(1);
    for (const [i, d] of rows) {
      expect(Number(i)).toBeGreaterThanOrEqual(5);
      expect(Number(i)).toBeLessThanOrEqual(7);
      expect(Number.isInteger(Number(i))).toBe(true);
      expect(Number(d)).toBeGreaterThanOrEqual(1);
      expect(Number(d)).toBeLessThanOrEqual(2);
      expect(d).toMatch(/^\d+\.\d{2}$/);
    }
  });

  it('keeps dates inside the range as ISO dates', () => {
    const rows = generateRows([{ name: 'd', type: 'date', from: '2026-03-01', to: '2026-03-03' }], 100, mulberry32(3)).slice(1);
    for (const [d] of rows) expect(['2026-03-01', '2026-03-02', '2026-03-03']).toContain(d);
  });

  it('picks only from the given choices, and blank when there are none', () => {
    const rows = generateRows([{ name: 'p', type: 'pick', options: 'red, green ,blue' }, { name: 'q', type: 'pick' }], 50, mulberry32(9)).slice(1);
    for (const [p, q] of rows) {
      expect(['red', 'green', 'blue']).toContain(p);
      expect(q).toBe('');
    }
  });

  it('produces valid v4 UUIDs and example.com emails', () => {
    const [, [uuid, email]] = generateRows([{ name: 'u', type: 'uuid' }, { name: 'e', type: 'email' }], 1, mulberry32(5));
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(email).toMatch(/^[a-z]+\.[a-z]+\d+@example\.com$/);
  });

  it('produces a value for every generator type', () => {
    const specs = GENERATOR_TYPES.map(t => ({ name: t.value, type: t.value, options: 'x' }));
    const [, row] = generateRows(specs, 1, mulberry32(11));
    row.forEach(v => expect(v).not.toBe(''));
  });
});
