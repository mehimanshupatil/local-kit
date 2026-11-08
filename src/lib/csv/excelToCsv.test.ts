import { describe, expect, it } from 'vitest';
import { cellToString, sheetFileName } from './excelToCsv';

describe('cellToString', () => {
  it('renders empty cells as empty strings', () => {
    expect(cellToString(null)).toBe('');
    expect(cellToString(undefined)).toBe('');
  });

  it('renders date-only cells as ISO dates in UTC regardless of local timezone', () => {
    expect(cellToString(new Date(Date.UTC(2026, 0, 5)))).toBe('2026-01-05');
  });

  it('includes the time when the cell has one', () => {
    expect(cellToString(new Date(Date.UTC(2026, 0, 5, 9, 30, 0)))).toBe('2026-01-05 09:30:00');
  });

  it('renders booleans the way Excel does', () => {
    expect(cellToString(true)).toBe('TRUE');
    expect(cellToString(false)).toBe('FALSE');
  });

  it('passes stored number text through untouched', () => {
    expect(cellToString('12345678901234567890')).toBe('12345678901234567890');
  });
});

describe('sheetFileName', () => {
  it('uses the workbook name alone for single-sheet books', () => {
    expect(sheetFileName('report', 'Sheet1', false)).toBe('report.csv');
  });

  it('appends a filename-safe sheet name for multi-sheet books', () => {
    expect(sheetFileName('report', 'Q1 / Sales', true)).toBe('report-Q1-Sales.csv');
  });

  it('falls back when the sheet name is all unsafe characters', () => {
    expect(sheetFileName('report', '///', true)).toBe('report-sheet.csv');
  });
});
