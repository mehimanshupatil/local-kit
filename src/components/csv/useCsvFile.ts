import { useState } from 'react';
import { readCsvFile, type Delimiter, type Grid } from '@/lib/csv/csv';

export interface CsvFileState {
  file: File | null;
  /** Parsed rows, or null while loading / after an error */
  rows: Grid | null;
  delimiter: Delimiter;
  loading: boolean;
  error: string;
  /** Load the first of the dropped files; resolves with the parsed CSV, or null on error */
  load: (files: File[]) => Promise<{ rows: Grid; delimiter: Delimiter } | null>;
  reset: () => void;
}

/** Shared single-file CSV loading for the transform tools (Cleaner, Column Editor, Sort & Filter). */
export function useCsvFile(): CsvFileState {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Grid | null>(null);
  const [delimiter, setDelimiter] = useState<Delimiter>(',');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async (files: File[]) => {
    const f = files[0];
    if (!f) return null;
    setFile(f);
    setRows(null);
    setError('');
    setLoading(true);
    try {
      const parsed = await readCsvFile(f);
      setRows(parsed.rows);
      setDelimiter(parsed.delimiter);
      return parsed;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read this file.');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setFile(null);
    setRows(null);
    setError('');
    setLoading(false);
  };

  return { file, rows, delimiter, loading, error, load, reset };
}
