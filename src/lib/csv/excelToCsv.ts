import readXlsxFile from 'read-excel-file/browser';
import { normalizeGrid, type Grid } from './csv';

export interface SheetGrid {
  name: string;
  rows: Grid;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Render a spreadsheet cell as CSV text. read-excel-file returns dates as UTC
 * Dates, so format with UTC getters — local getters would shift the day for
 * anyone west of Greenwich.
 */
export function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    const date = `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
    const h = value.getUTCHours(), m = value.getUTCMinutes(), s = value.getUTCSeconds();
    return h || m || s ? `${date} ${pad(h)}:${pad(m)}:${pad(s)}` : date;
  }
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return String(value);
}

/** `report.xlsx` + sheet `Q1 / Sales` → `report-Q1-Sales.csv`; single-sheet books drop the suffix. */
export function sheetFileName(baseName: string, sheetName: string, multiSheet: boolean): string {
  if (!multiSheet) return `${baseName}.csv`;
  const safe = sheetName.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '') || 'sheet';
  return `${baseName}-${safe}.csv`;
}

export async function readWorkbook(file: File): Promise<SheetGrid[]> {
  try {
    // Keep numbers as their stored text so long IDs and decimals don't pick up float noise
    const sheets = await readXlsxFile<string>(file, { parseNumber: s => s });
    return sheets.map(s => ({
      name: s.sheet,
      rows: normalizeGrid(s.data.map(r => r.map(cellToString))),
    }));
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'XLS_FILE_NOT_SUPPORTED') {
      throw new Error('Legacy .xls files are not supported. Re-save the file as .xlsx in Excel and try again.');
    }
    if (code === 'NO_DATA') throw new Error('This workbook has no data.');
    throw new Error('Could not read this file. Make sure it is a valid .xlsx workbook.');
  }
}
