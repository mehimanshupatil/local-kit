import { useMemo, useState } from 'react';
import { useImmer } from 'use-immer';
import { FileCsvIcon, WarningIcon, XIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import DropZone from '@/components/shared/DropZone';
import OutputFiles from '@/components/shared/OutputFiles';
import CsvOptionsFields from '@/components/csv/CsvOptionsFields';
import { useToolVisit } from '@/stores/toolVisit';
import { type ToolOp, IDLE_OP } from '@/lib/utils/toolState';
import { formatFileSize } from '@/lib/utils/fileUtils';
import { cn } from '@/lib/utils/cn';
import { DEFAULT_CSV_OPTIONS, csvOutputFile, readCsvFile, type CsvOptions, type Delimiter, type Grid } from '@/lib/csv/csv';
import { alignColumns, commonColumns, diffCsv, diffReport, type DiffCell, type DiffStatus } from '@/lib/csv/diff';

const MAX_RENDERED_ROWS = 1000;

type Side = 'original' | 'changed';
type Filter = 'all' | Exclude<DiffStatus, 'unchanged'>;

interface Loaded {
  file: File;
  rows: Grid;
  delimiter: Delimiter;
}

interface SlotState {
  file: File | null;
  data: Loaded | null;
  error: string;
  loading: boolean;
}

const EMPTY_SLOT: SlotState = { file: null, data: null, error: '', loading: false };

const STATUS_STYLES: Record<DiffStatus, { row: string; badge: string; label: string }> = {
  added: { row: 'bg-green-500/10', badge: 'text-green-600 dark:text-green-400', label: 'Added' },
  removed: { row: 'bg-red-500/10', badge: 'text-red-600 dark:text-red-400', label: 'Removed' },
  changed: { row: 'bg-amber-500/10', badge: 'text-amber-600 dark:text-amber-400', label: 'Changed' },
  unchanged: { row: '', badge: 'text-muted-foreground', label: 'Unchanged' },
};

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;

function FileSlot({ side, title, slot, onFiles, onRemove }: {
  side: Side; title: string; slot: SlotState; onFiles: (files: File[]) => void; onRemove: () => void;
}) {
  const rows = slot.data?.rows;
  return (
    <section aria-label={`${title} file`} className="space-y-2 min-w-0">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {!slot.file ? (
        <DropZone
          onFiles={onFiles}
          accept=".csv,.tsv,.txt"
          multiple={false}
          label={`Drop the ${side} CSV`}
          sublabel="Accepts .csv, .tsv, .txt"
        />
      ) : (
        <Card>
          <CardContent className="pt-5 space-y-3">
            <div className="flex items-center gap-3">
              <FileCsvIcon className="size-6 shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{slot.file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(slot.file.size)}
                  {rows && ` · ${plural(rows.length, 'line')} · ${plural(rows[0]?.length ?? 0, 'column')}`}
                </p>
              </div>
              <Button variant="ghost" size="icon" aria-label={`Remove ${side} file`} onClick={onRemove}
                className="shrink-0 text-muted-foreground hover:text-red-500">
                <XIcon className="size-4" />
              </Button>
            </div>
            {slot.loading && <p className="text-sm text-muted-foreground">Reading file…</p>}
            {slot.error && (
              <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-4 py-3 rounded-xl">
                {slot.error}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function DiffValue({ cell, status }: { cell: DiffCell; status: DiffStatus }) {
  if (cell.changed) {
    return (
      <>
        <span className="rounded px-1 bg-red-500/15 text-red-600 dark:text-red-400 line-through decoration-red-500/60">{cell.old}</span>
        {' → '}
        <span className="rounded px-1 bg-green-500/15 text-green-600 dark:text-green-400">{cell.new}</span>
      </>
    );
  }
  const value = cell.new ?? cell.old ?? '';
  return (
    <span className={cn(
      status === 'added' && 'text-green-600 dark:text-green-400',
      status === 'removed' && 'text-red-600 dark:text-red-400',
    )}>
      {value}
    </span>
  );
}

export default function CsvDiffTool() {
  useToolVisit('csv', '/csv/diff');

  const [slots, updateSlots] = useImmer<Record<Side, SlotState>>({ original: EMPTY_SLOT, changed: EMPTY_SLOT });
  const [hasHeader, setHasHeader] = useState(true);
  const [keyChoice, setKeyChoice] = useState<string | null>(null);
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [trim, setTrim] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [options, setOptions] = useState<CsvOptions>(DEFAULT_CSV_OPTIONS);
  const [op, updateOp] = useImmer<ToolOp>({ ...IDLE_OP });
  const { output } = op;

  const original = slots.original.data;
  const changed = slots.changed.data;

  const clearOutput = () => updateOp(() => ({ ...IDLE_OP }));

  const loadSide = (side: Side) => async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    updateSlots(d => { d[side] = { file: f, data: null, error: '', loading: true }; });
    clearOutput();
    try {
      const { rows, delimiter } = await readCsvFile(f);
      updateSlots(d => { d[side] = { file: f, data: { file: f, rows, delimiter }, error: '', loading: false }; });
      if (side === 'original') setOptions({ ...DEFAULT_CSV_OPTIONS, delimiter });
    } catch (e) {
      updateSlots(d => { d[side] = { file: f, data: null, error: e instanceof Error ? e.message : 'Failed to read file', loading: false }; });
    }
  };

  const removeSide = (side: Side) => {
    updateSlots(d => { d[side] = EMPTY_SLOT; });
    clearOutput();
  };

  const columns = useMemo(
    () => (original && changed ? alignColumns(original.rows, changed.rows, hasHeader) : []),
    [original, changed, hasHeader],
  );
  const keyOptions = useMemo(() => commonColumns(columns), [columns]);

  // Default to the first common column; fall back to it if the chosen key disappears
  const key: number | 'position' = keyChoice === 'position'
    ? 'position'
    : keyChoice !== null && keyOptions.includes(Number(keyChoice))
      ? Number(keyChoice)
      : keyOptions[0] ?? 'position';

  const result = useMemo(() => {
    if (!original || !changed) return null;
    return diffCsv(original.rows, changed.rows, { hasHeader, key, ignoreCase, trim });
  }, [original, changed, hasHeader, key, ignoreCase, trim]);

  const visible = useMemo(
    () => (result ? result.rows.filter(r => filter === 'all' || r.status === filter) : []),
    [result, filter],
  );

  const exportReport = () => {
    if (!result) return;
    updateOp(d => { d.output = [csvOutputFile('diff-report.csv', diffReport(result), options)]; d.status = 'done'; });
  };

  const keyLabel = (v: string) => (v === 'position' ? 'Row position' : columns[Number(v)]?.name ?? '');
  const warnings: string[] = [];
  if (result) {
    const { duplicateKeys: dk, blankKeys: bk } = result;
    const sample = (keys: string[]) => keys.slice(0, 3).map(k => `“${k}”`).join(', ') + (keys.length > 3 ? ', …' : '');
    if (dk.original.length) warnings.push(`Duplicate keys in Original (${sample(dk.original)}) — only the first occurrence of each is matched.`);
    if (dk.changed.length) warnings.push(`Duplicate keys in Changed (${sample(dk.changed)}) — only the first occurrence of each is matched.`);
    if (bk.original || bk.changed) warnings.push(`${plural(bk.original + bk.changed, 'row')} with a blank key can't be matched and show as added or removed.`);
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FileSlot side="original" title="Original" slot={slots.original} onFiles={loadSide('original')} onRemove={() => removeSide('original')} />
        <FileSlot side="changed" title="Changed" slot={slots.changed} onFiles={loadSide('changed')} onRemove={() => removeSide('changed')} />
      </div>

      {result && (
        <Card>
          <CardContent className="pt-5 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Match rows by</Label>
                <Select
                  value={key === 'position' ? 'position' : String(key)}
                  onValueChange={v => { if (v !== null) { setKeyChoice(v); clearOutput(); } }}
                >
                  <SelectTrigger className="w-full" aria-label="Match rows by">
                    <SelectValue>{keyLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {keyOptions.map(i => (
                      <SelectItem key={i} value={String(i)}>{columns[i].name}</SelectItem>
                    ))}
                    <SelectItem value="position">Row position</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col justify-end gap-2.5 sm:pb-1">
                <Label className="flex items-center gap-2 font-normal">
                  <Checkbox checked={hasHeader} onCheckedChange={c => { setHasHeader(c); clearOutput(); }} />
                  First row is header
                </Label>
              </div>
              <Label className="flex items-center gap-2 font-normal">
                <Checkbox checked={ignoreCase} onCheckedChange={c => { setIgnoreCase(c); clearOutput(); }} />
                Ignore case
              </Label>
              <Label className="flex items-center gap-2 font-normal">
                <Checkbox checked={trim} onCheckedChange={c => { setTrim(c); clearOutput(); }} />
                Trim whitespace before comparing
              </Label>
            </div>

            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2" aria-label="Summary">
              {(['added', 'removed', 'changed', 'unchanged'] as const).map(s => (
                <div key={s} className="rounded-xl bg-secondary px-3 py-2.5">
                  <dt className="text-xs text-muted-foreground">{STATUS_STYLES[s].label}</dt>
                  <dd className={cn('text-lg font-semibold tabular-nums', STATUS_STYLES[s].badge)}>
                    {result.counts[s].toLocaleString()}
                  </dd>
                </div>
              ))}
            </dl>

            {(result.onlyInOriginal.length > 0 || result.onlyInChanged.length > 0) && (
              <div className="text-sm text-muted-foreground space-y-1">
                {result.onlyInOriginal.length > 0 && (
                  <p>Only in Original: <span className="text-foreground">{result.onlyInOriginal.join(', ')}</span></p>
                )}
                {result.onlyInChanged.length > 0 && (
                  <p>Only in Changed: <span className="text-foreground">{result.onlyInChanged.join(', ')}</span></p>
                )}
                <p className="text-xs">These columns are shown but not compared.</p>
              </div>
            )}

            {warnings.length > 0 && (
              <div className="text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 rounded-xl space-y-1">
                {warnings.map(w => (
                  <p key={w} className="flex gap-2"><WarningIcon className="size-4 shrink-0 mt-0.5" />{w}</p>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <Tabs value={filter} onValueChange={v => setFilter(v as Filter)}>
                <TabsList className="w-full sm:w-auto">
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="added">Added</TabsTrigger>
                  <TabsTrigger value="removed">Removed</TabsTrigger>
                  <TabsTrigger value="changed">Changed</TabsTrigger>
                </TabsList>
              </Tabs>

              {visible.length === 0 ? (
                <p className="text-sm text-muted-foreground px-3 py-6 text-center rounded-xl border border-border">
                  No {filter === 'all' ? '' : `${filter} `}rows.
                </p>
              ) : (
                <>
                  {visible.length > MAX_RENDERED_ROWS && (
                    <p className="text-xs text-muted-foreground">
                      Showing the first {MAX_RENDERED_ROWS.toLocaleString()} of {visible.length.toLocaleString()} rows — export the report to see everything.
                    </p>
                  )}
                  <div className="rounded-xl border border-border max-h-[32rem] overflow-auto">
                    <Table aria-label="Differences">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Status</TableHead>
                          {result.columns.map((c, i) => (
                            <TableHead key={i} className={cn('max-w-60 truncate', (c.original === null || c.changed === null) && 'italic')}>
                              {c.name}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visible.slice(0, MAX_RENDERED_ROWS).map((row, r) => (
                          <TableRow key={r} className={STATUS_STYLES[row.status].row}>
                            <TableCell className={cn('font-medium', STATUS_STYLES[row.status].badge)}>
                              {STATUS_STYLES[row.status].label}
                            </TableCell>
                            {row.cells.map((cell, c) => (
                              <TableCell key={c} className="max-w-80 truncate">
                                <DiffValue cell={cell} status={row.status} />
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </div>

            <CsvOptionsFields options={options} onChange={o => { setOptions(o); clearOutput(); }} />

            <Button onClick={exportReport}>Export diff report</Button>
          </CardContent>
        </Card>
      )}

      {output.length > 0 && <OutputFiles files={output} />}
    </div>
  );
}
