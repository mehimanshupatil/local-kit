import { serializeCsv, type Grid } from './csv';

export interface CellPos {
  r: number;
  c: number;
}

/** Inclusive rectangle, always top-left → bottom-right */
export interface CellRange {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

export function rangeBetween(a: CellPos, b: CellPos): CellRange {
  return {
    top: Math.min(a.r, b.r),
    left: Math.min(a.c, b.c),
    bottom: Math.max(a.r, b.r),
    right: Math.max(a.c, b.c),
  };
}

export function inRange(range: CellRange, r: number, c: number): boolean {
  return r >= range.top && r <= range.bottom && c >= range.left && c <= range.right;
}

export function isMultiCell(range: CellRange): boolean {
  return range.top !== range.bottom || range.left !== range.right;
}

export function sliceRange(grid: Grid, range: CellRange): Grid {
  return grid.slice(range.top, range.bottom + 1).map(r => r.slice(range.left, range.right + 1));
}

/** Tab-separated text in the shape Excel and Google Sheets paste back as a range. */
export function rangeToTsv(grid: Grid, range: CellRange): string {
  return serializeCsv(sliceRange(grid, range), { delimiter: '\t', quoteAll: false, lineEnding: '\n', bom: false });
}

function mapRange(grid: Grid, range: CellRange, fn: (r: number, c: number, v: string) => string): Grid {
  return grid.map((row, r) =>
    r < range.top || r > range.bottom ? row : row.map((v, c) => (c < range.left || c > range.right ? v : fn(r, c, v))));
}

export function clearRange(grid: Grid, range: CellRange): Grid {
  return mapRange(grid, range, () => '');
}

/** Copy the top row of the range into every row below it, like Ctrl+D in a spreadsheet. */
export function fillDown(grid: Grid, range: CellRange): Grid {
  const source = grid[range.top];
  return mapRange(grid, range, (_, c) => source[c]);
}
