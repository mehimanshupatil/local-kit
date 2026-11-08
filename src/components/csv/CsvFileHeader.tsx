import { FileCsvIcon, XIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { formatFileSize } from '@/lib/utils/fileUtils';
import type { CsvFileState } from './useCsvFile';

interface Props {
  source: CsvFileState;
  onRemove: () => void;
}

/** File name/size row with a remove button, plus the loading and error states, for single-file CSV tools. */
export default function CsvFileHeader({ source, onRemove }: Props) {
  const { file, rows, loading, error } = source;
  if (!file) return null;
  const dataRows = rows ? rows.length : 0;
  const cols = rows?.[0]?.length ?? 0;

  return (
    <>
      <div className="flex items-center gap-3">
        <FileCsvIcon className="size-6 shrink-0 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
          <p className="text-xs text-muted-foreground">
            {formatFileSize(file.size)}
            {rows && ` · ${dataRows} ${dataRows === 1 ? 'row' : 'rows'} × ${cols} ${cols === 1 ? 'column' : 'columns'}`}
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Remove file" onClick={onRemove}
          className="shrink-0 text-muted-foreground hover:text-red-500">
          <XIcon className="size-4" />
        </Button>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Reading CSV…</p>}
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-4 py-3 rounded-xl">
          {error}
        </p>
      )}
    </>
  );
}
