import { useMemo, useState } from 'react';
import { useImmer } from 'use-immer';
import { FileCsvIcon, XIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import DropZone from '@/components/shared/DropZone';
import OutputFiles from '@/components/shared/OutputFiles';
import CsvOptionsFields from '@/components/csv/CsvOptionsFields';
import CsvPreviewTable from '@/components/csv/CsvPreviewTable';
import { useToolVisit } from '@/stores/toolVisit';
import { type ToolOp, IDLE_OP } from '@/lib/utils/toolState';
import { formatFileSize, stripExtension } from '@/lib/utils/fileUtils';
import { cn } from '@/lib/utils/cn';
import { DEFAULT_CSV_OPTIONS, columnLabel, csvOutputFile, headerNames, readCsvFile, type CsvOptions, type Grid } from '@/lib/csv/csv';
import { MAX_SPLIT_FILES, countSplitParts, splitCsv, type SplitConfig } from '@/lib/csv/split';

const PREVIEW_ROWS = 10;

type Mode = SplitConfig['mode'];

export default function CsvSplitTool() {
  useToolVisit('csv', '/csv/split');

  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Grid>([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [mode, setMode] = useState<Mode>('rows');
  const [rowsPerFile, setRowsPerFile] = useState('1000');
  const [repeatHeader, setRepeatHeader] = useState(true);
  const [column, setColumn] = useState(0);
  const [options, setOptions] = useState<CsvOptions>(DEFAULT_CSV_OPTIONS);
  const [op, updateOp] = useImmer<ToolOp>({ ...IDLE_OP });
  const { status, output, error } = op;

  const baseName = file ? stripExtension(file.name) : 'data';
  const columnNames = hasHeader ? headerNames(rows) : (rows[0] ?? []).map((_, i) => `Column ${columnLabel(i)}`);
  const dataCount = Math.max(0, rows.length - (hasHeader ? 1 : 0));
  const chunkSize = Math.floor(Number(rowsPerFile));
  const chunkValid = Number.isFinite(chunkSize) && chunkSize >= 1;

  const config = useMemo<SplitConfig>(() => (mode === 'rows'
    ? { mode, rowsPerFile: chunkValid ? chunkSize : 1, hasHeader, repeatHeader }
    : { mode, column, hasHeader }), [mode, chunkSize, chunkValid, hasHeader, repeatHeader, column]);
  const partCount = useMemo(() => (rows.length ? countSplitParts(rows, config) : 0), [rows, config]);
  const tooMany = partCount > MAX_SPLIT_FILES;
  const canSplit = rows.length > 0 && dataCount > 0 && partCount > 0 && !tooMany && (mode === 'column' || chunkValid);

  const clearOutput = () => updateOp(d => { d.output = []; d.status = 'idle'; d.error = ''; });

  const handleFile = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setFile(f);
    setRows([]);
    setColumn(0);
    updateOp(() => ({ ...IDLE_OP, status: 'loading' }));
    try {
      const parsed = await readCsvFile(f);
      setRows(parsed.rows);
      setOptions({ ...DEFAULT_CSV_OPTIONS, delimiter: parsed.delimiter });
      updateOp(() => ({ ...IDLE_OP }));
    } catch (e) {
      updateOp(() => ({ ...IDLE_OP, status: 'error', error: e instanceof Error ? e.message : 'Failed to read file' }));
    }
  };

  const split = () => {
    try {
      const parts = splitCsv(rows, baseName, config);
      const files = parts.map(p => csvOutputFile(p.name, p.rows, options));
      updateOp(d => { d.output = files; d.status = 'done'; d.error = ''; });
    } catch (e) {
      updateOp(d => { d.output = []; d.status = 'error'; d.error = e instanceof Error ? e.message : 'Failed to split'; });
    }
  };

  const reset = () => {
    setFile(null);
    setRows([]);
    updateOp(() => ({ ...IDLE_OP }));
  };

  return (
    <div className="space-y-5">
      {!file ? (
        <DropZone
          onFiles={handleFile}
          accept=".csv,.tsv,.txt"
          multiple={false}
          label="Drop a CSV file"
          sublabel="Accepts .csv, .tsv, .txt · split by row count or by a column's values"
        />
      ) : (
        <Card>
          <CardContent className="pt-5 space-y-5">
            <div className="flex items-center gap-3">
              <FileCsvIcon className="size-6 shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(file.size)}
                  {rows.length > 0 && ` · ${dataCount.toLocaleString()} ${dataCount === 1 ? 'row' : 'rows'} · ${rows[0].length} ${rows[0].length === 1 ? 'column' : 'columns'}`}
                </p>
              </div>
              <Button variant="ghost" size="icon" aria-label="Remove file" onClick={reset}
                className="shrink-0 text-muted-foreground hover:text-red-500">
                <XIcon className="size-4" />
              </Button>
            </div>

            {status === 'loading' && <p className="text-sm text-muted-foreground">Reading file…</p>}
            {status === 'error' && (
              <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-4 py-3 rounded-xl">
                {error}
              </p>
            )}

            {rows.length > 0 && (
              <>
                <CsvPreviewTable rows={rows} header={hasHeader} maxRows={PREVIEW_ROWS} />

                <Label className="flex items-center gap-2 font-normal">
                  <Checkbox checked={hasHeader} onCheckedChange={c => { setHasHeader(c); clearOutput(); }} />
                  First row is header
                </Label>

                <div className="space-y-3">
                  <Label>Split</Label>
                  <Tabs value={mode} onValueChange={v => { setMode(v as Mode); clearOutput(); }}>
                    <TabsList className="w-full sm:w-auto">
                      <TabsTrigger value="rows">Every N rows</TabsTrigger>
                      <TabsTrigger value="column">By column value</TabsTrigger>
                    </TabsList>
                  </Tabs>

                  {mode === 'rows' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                      <div className="space-y-1.5">
                        <Label htmlFor="csv-split-rows">Rows per file</Label>
                        <Input
                          id="csv-split-rows"
                          type="number"
                          inputMode="numeric"
                          min={1}
                          step={1}
                          value={rowsPerFile}
                          aria-invalid={!chunkValid}
                          onChange={e => { setRowsPerFile(e.target.value); clearOutput(); }}
                        />
                      </div>
                      <Label className={cn('flex items-center gap-2 font-normal sm:pb-2', !hasHeader && 'opacity-50')}>
                        <Checkbox checked={repeatHeader} disabled={!hasHeader}
                          onCheckedChange={c => { setRepeatHeader(c); clearOutput(); }} />
                        Repeat header in every file
                      </Label>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <Label>Column</Label>
                      <Select value={String(column)} onValueChange={v => { if (v !== null) { setColumn(Number(v)); clearOutput(); } }}>
                        <SelectTrigger className="w-full sm:w-72" aria-label="Column">
                          <SelectValue>{(v: string) => columnNames[Number(v)]}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {columnNames.map((name, i) => (
                            <SelectItem key={i} value={String(i)}>{name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {dataCount === 0 ? (
                  <p className="text-sm text-muted-foreground">There are no data rows to split.</p>
                ) : tooMany ? (
                  <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-4 py-3 rounded-xl">
                    This would create {partCount.toLocaleString()} files — the limit is {MAX_SPLIT_FILES.toLocaleString()}.{' '}
                    {mode === 'rows' ? 'Use more rows per file.' : 'Pick a column with fewer distinct values.'}
                  </p>
                ) : (
                  canSplit && (
                    <p className="text-sm text-muted-foreground">
                      Will produce <span className="font-medium text-foreground">{partCount.toLocaleString()}</span>{' '}
                      {partCount === 1 ? 'file' : 'files'}.
                    </p>
                  )
                )}

                <CsvOptionsFields options={options} onChange={o => { setOptions(o); clearOutput(); }} />

                <Button onClick={split} disabled={!canSplit}>
                  {canSplit ? `Split into ${partCount.toLocaleString()} ${partCount === 1 ? 'file' : 'files'}` : 'Split CSV'}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {output.length > 0 && <OutputFiles files={output} />}
    </div>
  );
}
