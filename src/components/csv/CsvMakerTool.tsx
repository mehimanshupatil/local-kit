import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { useClipboard, useDebouncedCallback, useDisclosure, useHotkeys } from '@mantine/hooks';
import {
  ArrowClockwiseIcon, ArrowCounterClockwiseIcon, ArrowDownIcon, ArrowLeftIcon, ArrowRightIcon, ArrowUpIcon,
  CheckIcon, CopyIcon, DownloadSimpleIcon, MagicWandIcon, PlusIcon, TrashIcon, UploadIcon, XIcon,
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
import CsvGeneratorDialog from '@/components/csv/CsvGeneratorDialog';
import { useToolVisit } from '@/stores/toolVisit';
import { cn } from '@/lib/utils/cn';
import { downloadBlob } from '@/lib/utils/downloadUtils';
import { stripExtension } from '@/lib/utils/fileUtils';
import {
  DEFAULT_CSV_OPTIONS, columnLabel, csvBlob, deleteCol, deleteRow, emptyGrid, insertCol, insertRow,
  moveCol, moveRow, normalizeGrid, parseClipboardTable, pasteIntoGrid, readCsvFile, serializeCsv, trimGrid,
  type CsvOptions, type Grid,
} from '@/lib/csv/csv';
import { createHistory, pushHistory, redo, undo } from '@/lib/csv/gridHistory';
import {
  clearRange, fillDown, inRange, isMultiCell, rangeBetween, rangeToTsv, type CellPos,
} from '@/lib/csv/selection';

/** Rendering thousands of inputs locks up the page; past this the grid shows a window and export still uses every row. */
const MAX_RENDER_ROWS = 500;
const STORAGE_KEY = 'localkit:csv-maker';
/** Serialising a huge grid on every edit would stall typing and overflow localStorage */
const MAX_AUTOSAVE_CELLS = 200_000;

interface SavedSession {
  grid: Grid;
  headerRow: boolean;
  options: CsvOptions;
  fileName: string;
}

function loadSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SavedSession;
    const valid = Array.isArray(s.grid) && s.grid.length > 0
      && s.grid.every(r => Array.isArray(r) && r.every(c => typeof c === 'string'));
    return valid ? { ...s, grid: normalizeGrid(s.grid), options: { ...DEFAULT_CSV_OPTIONS, ...s.options } } : null;
  } catch {
    return null;
  }
}

export default function CsvMakerTool() {
  useToolVisit('csv', '/csv/maker');

  const [history, setHistory] = useState(() => createHistory(emptyGrid(5, 4)));
  const grid = history.present;
  const [headerRow, setHeaderRow] = useState(true);
  const [options, setOptions] = useState<CsvOptions>(DEFAULT_CSV_OPTIONS);
  const [fileName, setFileName] = useState('data');
  const [importError, setImportError] = useState('');
  const [importOpen, importPanel] = useDisclosure(false);
  const [clearOpen, clearDialog] = useDisclosure(false);
  const [generatorOpen, generatorDialog] = useDisclosure(false);
  const [anchor, setAnchor] = useState<CellPos>({ r: 0, c: 0 });
  const [cursor, setCursor] = useState<CellPos>({ r: 0, c: 0 });
  const [restored, setRestored] = useState(false);
  const [autosave, setAutosave] = useState<'on' | 'too-large' | 'unavailable'>('on');
  const clipboard = useClipboard({ timeout: 2000 });
  const rangeClipboard = useClipboard({ timeout: 2000 });
  const gridRef = useRef<HTMLDivElement>(null);
  /** Set while a shift-click / shift-arrow moves focus, so the focus handler extends instead of resetting the selection */
  const extending = useRef(false);
  const loaded = useRef(false);

  const cols = grid[0]?.length ?? 1;
  const visibleRows = grid.slice(0, MAX_RENDER_ROWS);
  const exportRows = useMemo(() => trimGrid(grid), [grid]);
  const csvText = useMemo(() => serializeCsv(exportRows, options), [exportRows, options]);
  const hasData = grid.some(r => r.some(c => c !== ''));
  const range = rangeBetween(anchor, cursor);
  const multi = isMultiCell(range);
  const selectedCount = (range.bottom - range.top + 1) * (range.right - range.left + 1);

  const updateGrid = (fn: (g: Grid) => Grid, key: string | null = null) =>
    setHistory(h => pushHistory(h, fn(h.present), key));
  const handleUndo = () => setHistory(undo);
  const handleRedo = () => setHistory(redo);

  useHotkeys([['mod+Z', handleUndo], ['mod+shift+Z', handleRedo], ['mod+Y', handleRedo]]);

  // Restore after mount, not in the initial state, so the server-rendered HTML matches the first client render
  useEffect(() => {
    const saved = loadSession();
    if (saved) {
      setHistory(createHistory(saved.grid));
      setHeaderRow(saved.headerRow);
      setOptions(saved.options);
      setFileName(saved.fileName);
      setRestored(saved.grid.some(r => r.some(c => c !== '')));
    }
    loaded.current = true;
  }, []);

  const saveSession = useDebouncedCallback((session: SavedSession) => {
    if (session.grid.length * (session.grid[0]?.length ?? 0) > MAX_AUTOSAVE_CELLS) {
      setAutosave('too-large');
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      setAutosave('on');
    } catch {
      setAutosave('unavailable');
    }
  }, 500);

  useEffect(() => {
    if (loaded.current) saveSession({ grid, headerRow, options, fileName });
  }, [grid, headerRow, options, fileName]);

  const setCell = (r: number, c: number, value: string) =>
    updateGrid(g => g.map((row, i) => (i === r ? row.map((v, j) => (j === c ? value : v)) : row)), `cell:${r}-${c}`);

  const focusCell = (r: number, c: number, extend = false) => {
    if (extend) setCursor({ r, c });
    requestAnimationFrame(() => {
      const el = gridRef.current?.querySelector<HTMLInputElement>(`[data-cell="${r}-${c}"]`);
      // Focusing the already-focused cell fires no focus event, so the flag would never be cleared
      if (!el || el === document.activeElement) return;
      extending.current = extend;
      el.focus();
    });
  };

  const handleFocus = (r: number, c: number) => {
    if (extending.current) {
      extending.current = false;
      return;
    }
    setAnchor({ r, c });
    setCursor({ r, c });
  };

  const handleMouseDown = (e: MouseEvent<HTMLInputElement>, r: number, c: number) => {
    if (!e.shiftKey) return;
    if (e.currentTarget !== document.activeElement) extending.current = true;
    setCursor({ r, c });
  };

  const copyRange = () => rangeClipboard.copy(rangeToTsv(grid, range));

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>, r: number, c: number) => {
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();
    const input = e.currentTarget;
    const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
    const atEnd = input.selectionStart === input.value.length;
    const lastRow = Math.min(grid.length, MAX_RENDER_ROWS) - 1;

    // Grid-level undo replaces the input's own, which only knows about this one cell
    if (mod && key === 'z') {
      e.preventDefault();
      if (e.shiftKey) handleRedo(); else handleUndo();
    } else if (mod && key === 'y') {
      e.preventDefault();
      handleRedo();
    } else if (mod && key === 'd') {
      e.preventDefault();
      updateGrid(g => fillDown(g, multi ? range : rangeBetween({ r: Math.max(0, r - 1), c }, { r, c })));
    } else if (multi && mod && (key === 'c' || key === 'x')) {
      e.preventDefault();
      copyRange();
      if (key === 'x') updateGrid(g => clearRange(g, range));
    } else if (multi && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault();
      updateGrid(g => clearRange(g, range));
    } else if (e.key === 'Escape' && multi) {
      setAnchor(cursor);
    } else if (e.shiftKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const nextR = e.key === 'ArrowDown' ? Math.min(lastRow, cursor.r + 1) : Math.max(0, cursor.r - 1);
      focusCell(nextR, cursor.c, true);
    } else if (e.shiftKey && e.key === 'ArrowLeft' && (atStart || multi)) {
      e.preventDefault();
      focusCell(cursor.r, Math.max(0, cursor.c - 1), true);
    } else if (e.shiftKey && e.key === 'ArrowRight' && (atEnd || multi)) {
      e.preventDefault();
      focusCell(cursor.r, Math.min(cols - 1, cursor.c + 1), true);
    } else if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      const up = e.key === 'Enter' && e.shiftKey;
      if (!up && r === grid.length - 1) updateGrid(g => insertRow(g, g.length));
      focusCell(up ? Math.max(0, r - 1) : r + 1, c);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusCell(Math.max(0, r - 1), c);
    } else if (e.key === 'ArrowLeft' && atStart && c > 0) {
      e.preventDefault();
      focusCell(r, c - 1);
    } else if (e.key === 'ArrowRight' && atEnd && input.selectionEnd === input.value.length && c < cols - 1) {
      e.preventDefault();
      focusCell(r, c + 1);
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>, r: number, c: number) => {
    const text = e.clipboardData.getData('text/plain');
    // Single values paste natively into the cell; only tables take over the grid
    if (!/[\t\n]/.test(text)) return;
    e.preventDefault();
    const at = multi ? { r: range.top, c: range.left } : { r, c };
    updateGrid(g => pasteIntoGrid(g, parseClipboardTable(text), at.r, at.c));
  };

  const handleImport = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setImportError('');
    try {
      const { rows, delimiter } = await readCsvFile(file);
      updateGrid(() => rows);
      setOptions(o => ({ ...o, delimiter }));
      setFileName(stripExtension(file.name) || 'data');
      importPanel.close();
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Could not read that file.');
    }
  };

  const handleGenerate = (rows: Grid) => {
    updateGrid(() => rows);
    setHeaderRow(true);
    setFileName('sample-data');
  };

  const handleClear = () => {
    updateGrid(() => emptyGrid(5, 4));
    setFileName('data');
    setRestored(false);
    clearDialog.close();
  };

  const handleDownload = () => {
    const name = (fileName.trim() || 'data').replace(/\.csv$/i, '');
    downloadBlob(csvBlob(csvText, options.bom), `${name}.csv`);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon-sm" aria-label="Undo" title="Undo (Ctrl+Z)"
          disabled={history.past.length === 0} onClick={handleUndo}>
          <ArrowCounterClockwiseIcon />
        </Button>
        <Button variant="outline" size="icon-sm" aria-label="Redo" title="Redo (Ctrl+Shift+Z)"
          disabled={history.future.length === 0} onClick={handleRedo}>
          <ArrowClockwiseIcon />
        </Button>
        <Button variant="outline" size="sm" onClick={importPanel.toggle}>
          <UploadIcon /> Import CSV
        </Button>
        <Button variant="outline" size="sm" onClick={generatorDialog.open}>
          <MagicWandIcon /> Generate data
        </Button>
        <Button variant="outline" size="sm" onClick={() => updateGrid(g => insertRow(g, g.length))}>
          <PlusIcon /> Row
        </Button>
        <Button variant="outline" size="sm" onClick={() => updateGrid(g => insertCol(g, cols))}>
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

      {restored && (
        <p className="text-xs text-muted-foreground">
          Restored your last session from this browser. Use Clear to start over.
        </p>
      )}

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

      {multi && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">{selectedCount} cells selected</span>
          <Button variant="outline" size="xs" onMouseDown={e => e.preventDefault()} onClick={copyRange}>
            {rangeClipboard.copied ? <><CheckIcon className="text-green-500" /> Copied</> : <><CopyIcon /> Copy</>}
          </Button>
          <Button variant="outline" size="xs" onMouseDown={e => e.preventDefault()}
            onClick={() => updateGrid(g => fillDown(g, range))}>
            <ArrowDownIcon /> Fill down
          </Button>
          <Button variant="outline" size="xs" onMouseDown={e => e.preventDefault()}
            onClick={() => updateGrid(g => clearRange(g, range))}>
            <XIcon /> Clear cells
          </Button>
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
                          onClick={() => updateGrid(g => moveCol(g, c, c - 1))}>
                          <ArrowLeftIcon />
                        </Button>
                        <Button variant="ghost" size="icon-xs" aria-label={`Move column ${columnLabel(c)} right`} disabled={c === cols - 1}
                          onClick={() => updateGrid(g => moveCol(g, c, c + 1))}>
                          <ArrowRightIcon />
                        </Button>
                        <Button variant="ghost" size="icon-xs" aria-label={`Delete column ${columnLabel(c)}`}
                          className="hover:text-red-500" onClick={() => updateGrid(g => deleteCol(g, c))}>
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
                    <td key={c} className={cn('border-b border-r border-border p-0', multi && inRange(range, r, c) && 'bg-brand-500/15')}>
                      <Input
                        data-cell={`${r}-${c}`}
                        aria-label={`Cell ${columnLabel(c)}${r + 1}`}
                        aria-selected={multi && inRange(range, r, c)}
                        value={value}
                        onChange={e => setCell(r, c, e.target.value)}
                        onKeyDown={e => handleKeyDown(e, r, c)}
                        onPaste={e => handlePaste(e, r, c)}
                        onFocus={() => handleFocus(r, c)}
                        onMouseDown={e => handleMouseDown(e, r, c)}
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
                        onClick={() => updateGrid(g => moveRow(g, r, r - 1))}>
                        <ArrowUpIcon />
                      </Button>
                      <Button variant="ghost" size="icon-xs" aria-label={`Move row ${r + 1} down`} disabled={r === grid.length - 1}
                        onClick={() => updateGrid(g => moveRow(g, r, r + 1))}>
                        <ArrowDownIcon />
                      </Button>
                      <Button variant="ghost" size="icon-xs" aria-label={`Delete row ${r + 1}`}
                        className="hover:text-red-500" onClick={() => updateGrid(g => deleteRow(g, r))}>
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

      <div className="text-xs text-muted-foreground space-y-1">
        {grid.length > MAX_RENDER_ROWS && (
          <p>Showing the first {MAX_RENDER_ROWS} of {grid.length} rows for editing — all rows are included in the download.</p>
        )}
        <p>
          Paste a range from Excel or Google Sheets into any cell to fill the grid. Shift+click or Shift+arrows selects
          cells to copy, clear (Delete) or fill down (Ctrl+D). Empty trailing rows and columns are dropped on export.
        </p>
        <p>
          {autosave === 'on' && 'Your grid is autosaved in this browser only — it never leaves your device.'}
          {autosave === 'too-large' && 'This grid is too large to autosave — download it before leaving the page.'}
          {autosave === 'unavailable' && "Autosave isn't available in this browser — download your CSV before leaving the page."}
        </p>
      </div>

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

      <CsvGeneratorDialog
        open={generatorOpen}
        onOpenChange={o => (o ? generatorDialog.open() : generatorDialog.close())}
        onGenerate={handleGenerate}
      />

      <AlertDialog open={clearOpen} onOpenChange={o => (o ? clearDialog.open() : clearDialog.close())}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear the grid?</AlertDialogTitle>
            <AlertDialogDescription>Every cell will be emptied. You can undo this.</AlertDialogDescription>
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
