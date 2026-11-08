import { useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { useClipboard, useDisclosure } from '@mantine/hooks';
import {
  ArrowDownIcon, ArrowLeftIcon, ArrowRightIcon, ArrowUpIcon, CheckIcon, CopyIcon,
  DownloadSimpleIcon, PlusIcon, TrashIcon, UploadIcon, XIcon,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import DropZone from '@/components/shared/DropZone';
import CsvOptionsFields from '@/components/csv/CsvOptionsFields';
import { useToolVisit } from '@/stores/toolVisit';
import { cn } from '@/lib/utils/cn';
import { downloadBlob } from '@/lib/utils/downloadUtils';
import { stripExtension } from '@/lib/utils/fileUtils';
import {
  DEFAULT_CSV_OPTIONS, columnLabel, csvBlob, deleteCol, deleteRow, emptyGrid, insertCol, insertRow,
  moveCol, moveRow, parseClipboardTable, pasteIntoGrid, readCsvFile, serializeCsv, trimGrid,
  type CsvOptions, type Grid,
} from '@/lib/csv/csv';

/** Rendering thousands of inputs locks up the page; past this the grid shows a window and export still uses every row. */
const MAX_RENDER_ROWS = 500;

export default function CsvMakerTool() {
  useToolVisit('csv', '/csv/maker');

  const [grid, setGrid] = useState<Grid>(() => emptyGrid(5, 4));
  const [headerRow, setHeaderRow] = useState(true);
  const [options, setOptions] = useState<CsvOptions>(DEFAULT_CSV_OPTIONS);
  const [fileName, setFileName] = useState('data');
  const [importError, setImportError] = useState('');
  const [importOpen, importPanel] = useDisclosure(false);
  const [clearOpen, clearDialog] = useDisclosure(false);
  const clipboard = useClipboard({ timeout: 2000 });
  const gridRef = useRef<HTMLDivElement>(null);

  const cols = grid[0]?.length ?? 1;
  const visibleRows = grid.slice(0, MAX_RENDER_ROWS);
  const exportRows = useMemo(() => trimGrid(grid), [grid]);
  const csvText = useMemo(() => serializeCsv(exportRows, options), [exportRows, options]);
  const hasData = grid.some(r => r.some(c => c !== ''));

  const setCell = (r: number, c: number, value: string) =>
    setGrid(g => g.map((row, i) => (i === r ? row.map((v, j) => (j === c ? value : v)) : row)));

  const focusCell = (r: number, c: number) =>
    requestAnimationFrame(() =>
      gridRef.current?.querySelector<HTMLInputElement>(`[data-cell="${r}-${c}"]`)?.focus());

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>, r: number, c: number) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      const up = e.key === 'Enter' && e.shiftKey;
      if (!up && r === grid.length - 1) setGrid(g => insertRow(g, g.length));
      focusCell(up ? Math.max(0, r - 1) : r + 1, c);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusCell(Math.max(0, r - 1), c);
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>, r: number, c: number) => {
    const text = e.clipboardData.getData('text/plain');
    // Single values paste natively into the cell; only tables take over the grid
    if (!/[\t\n]/.test(text)) return;
    e.preventDefault();
    setGrid(g => pasteIntoGrid(g, parseClipboardTable(text), r, c));
  };

  const handleImport = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setImportError('');
    try {
      const { rows, delimiter } = await readCsvFile(file);
      setGrid(rows);
      setOptions(o => ({ ...o, delimiter }));
      setFileName(stripExtension(file.name) || 'data');
      importPanel.close();
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Could not read that file.');
    }
  };

  const handleClear = () => {
    setGrid(emptyGrid(5, 4));
    setFileName('data');
    clearDialog.close();
  };

  const handleDownload = () => {
    const name = (fileName.trim() || 'data').replace(/\.csv$/i, '');
    downloadBlob(csvBlob(csvText, options.bom), `${name}.csv`);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={importPanel.toggle}>
          <UploadIcon /> Import CSV
        </Button>
        <Button variant="outline" size="sm" onClick={() => setGrid(g => insertRow(g, g.length))}>
          <PlusIcon /> Row
        </Button>
        <Button variant="outline" size="sm" onClick={() => setGrid(g => insertCol(g, cols))}>
          <PlusIcon /> Column
        </Button>
        <Button variant="outline" size="sm" onClick={clearDialog.open} disabled={!hasData}>
          <TrashIcon /> Clear
        </Button>
        <Label className="flex items-center gap-2 font-normal ml-auto">
          <Checkbox checked={headerRow} onCheckedChange={setHeaderRow} />
          First row is header
        </Label>
      </div>

      {importOpen && (
        <div className="space-y-2">
          <DropZone
            onFiles={handleImport}
            accept=".csv,.tsv,.txt"
            multiple={false}
            label="Drop a CSV file to edit"
            sublabel="Delimiter is detected automatically · replaces the current grid"
          />
          {importError && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-4 py-3 rounded-xl">
              {importError}
            </p>
          )}
        </div>
      )}

      <Card className="py-0">
        <div ref={gridRef} className="overflow-auto max-h-[60vh]">
          <table className="border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-card">
              <tr>
                <th className="w-10 border-b border-r border-border" />
                {grid[0]?.map((_, c) => (
                  <th key={c} className="group border-b border-r border-border px-1 py-1 font-medium text-muted-foreground min-w-36">
                    <div className="flex items-center justify-between gap-1">
                      <span className="pl-1 text-xs">{columnLabel(c)}</span>
                      <div className="flex opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon-xs" aria-label={`Move column ${columnLabel(c)} left`} disabled={c === 0}
                          onClick={() => setGrid(g => moveCol(g, c, c - 1))}>
                          <ArrowLeftIcon />
                        </Button>
                        <Button variant="ghost" size="icon-xs" aria-label={`Move column ${columnLabel(c)} right`} disabled={c === cols - 1}
                          onClick={() => setGrid(g => moveCol(g, c, c + 1))}>
                          <ArrowRightIcon />
                        </Button>
                        <Button variant="ghost" size="icon-xs" aria-label={`Delete column ${columnLabel(c)}`}
                          className="hover:text-red-500" onClick={() => setGrid(g => deleteCol(g, c))}>
                          <XIcon />
                        </Button>
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, r) => (
                <tr key={r} className="group">
                  <td className="border-b border-r border-border px-2 text-xs text-muted-foreground tabular-nums">
                    {r + 1}
                  </td>
                  {row.map((value, c) => (
                    <td key={c} className="border-b border-r border-border p-0">
                      <Input
                        data-cell={`${r}-${c}`}
                        aria-label={`Cell ${columnLabel(c)}${r + 1}`}
                        value={value}
                        onChange={e => setCell(r, c, e.target.value)}
                        onKeyDown={e => handleKeyDown(e, r, c)}
                        onPaste={e => handlePaste(e, r, c)}
                        className={cn(
                          'h-8 rounded-none border-0 bg-transparent dark:bg-transparent shadow-none focus-visible:ring-2 focus-visible:ring-inset',
                          headerRow && r === 0 && 'font-semibold bg-secondary/60 dark:bg-secondary/60',
                        )}
                      />
                    </td>
                  ))}
                  <td className="px-1">
                    <div className="flex opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon-xs" aria-label={`Move row ${r + 1} up`} disabled={r === 0}
                        onClick={() => setGrid(g => moveRow(g, r, r - 1))}>
                        <ArrowUpIcon />
                      </Button>
                      <Button variant="ghost" size="icon-xs" aria-label={`Move row ${r + 1} down`} disabled={r === grid.length - 1}
                        onClick={() => setGrid(g => moveRow(g, r, r + 1))}>
                        <ArrowDownIcon />
                      </Button>
                      <Button variant="ghost" size="icon-xs" aria-label={`Delete row ${r + 1}`}
                        className="hover:text-red-500" onClick={() => setGrid(g => deleteRow(g, r))}>
                        <XIcon />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-xs text-muted-foreground">
        {grid.length > MAX_RENDER_ROWS && <>Showing the first {MAX_RENDER_ROWS} of {grid.length} rows for editing — all rows are included in the download. </>}
        Paste a range from Excel or Google Sheets into any cell to fill the grid. Enter moves down; empty trailing rows and columns are dropped on export.
      </p>

      <Card>
        <CardContent className="pt-5 space-y-5">
          <CsvOptionsFields options={options} onChange={setOptions} />

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="csv-output">
                CSV preview · {exportRows.length} {exportRows.length === 1 ? 'row' : 'rows'} × {exportRows[0].length} {exportRows[0].length === 1 ? 'column' : 'columns'}
              </Label>
              <Button variant="ghost" size="sm" onClick={() => clipboard.copy(csvText)} className="h-7 px-2 text-xs gap-1.5">
                {clipboard.copied
                  ? <><CheckIcon className="size-3 text-green-500" /> Copied</>
                  : <><CopyIcon className="size-3" /> Copy</>}
              </Button>
            </div>
            <Textarea id="csv-output" readOnly value={csvText} rows={8} className="font-mono text-xs" />
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="csv-filename">File name</Label>
              <div className="flex items-center gap-1.5">
                <Input id="csv-filename" value={fileName} onChange={e => setFileName(e.target.value)} className="w-48" />
                <span className="text-sm text-muted-foreground">.csv</span>
              </div>
            </div>
            <Button onClick={handleDownload} disabled={!hasData}>
              <DownloadSimpleIcon /> Download CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={clearOpen} onOpenChange={o => (o ? clearDialog.open() : clearDialog.close())}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear the grid?</AlertDialogTitle>
            <AlertDialogDescription>Every cell will be emptied. This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleClear}>Clear grid</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
