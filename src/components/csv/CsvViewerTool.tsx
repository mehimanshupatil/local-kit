import { useEffect, useMemo, useRef, useState } from 'react';
import { useDebouncedValue } from '@mantine/hooks';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ArrowDownIcon, ArrowUpIcon, ArrowsDownUpIcon, ExportIcon, FileCsvIcon, MagnifyingGlassIcon, XIcon,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import DropZone from '@/components/shared/DropZone';
import OutputFiles, { type OutputFile } from '@/components/shared/OutputFiles';
import { useToolVisit } from '@/stores/toolVisit';
import { cn } from '@/lib/utils/cn';
import { formatFileSize, stripExtension } from '@/lib/utils/fileUtils';
import { DEFAULT_CSV_OPTIONS, columnLabel, csvOutputFile, headerNames, readCsvFile, type Grid } from '@/lib/csv/csv';
import {
  buildSearchIndex, columnStats, columnWidths, filterIndices, nextSort, sortIndices, type ColumnStats, type SortState,
} from '@/lib/csv/viewer';

const MAX_BYTES = 200 * 1024 * 1024;
const ROW_H = 33;
const HEADER_H = 37;
const ROWNUM_W = 64;

type Status = 'idle' | 'parsing' | 'ready' | 'error';

/** Resolve after the browser has had a chance to paint the current state. */
const nextPaint = () => new Promise<void>(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 4 });

export default function CsvViewerTool() {
  useToolVisit('csv', '/csv/viewer');

  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Grid>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [hasHeader, setHasHeader] = useState(true);
  const [query, setQuery] = useState('');
  const [debouncedQuery] = useDebouncedValue(query, 200);
  const [sort, setSort] = useState<SortState | null>(null);
  const [statsCol, setStatsCol] = useState<number | null>(null);
  const [output, setOutput] = useState<OutputFile[]>([]);
  const loadId = useRef(0);

  const handleFile = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    const id = ++loadId.current;
    setFile(f);
    setRows([]);
    setQuery('');
    setSort(null);
    setStatsCol(null);
    setOutput([]);
    setError('');
    setStatus('parsing');
    await nextPaint();
    try {
      const { rows: parsed } = await readCsvFile(f, MAX_BYTES);
      if (id !== loadId.current) return;
      setRows(parsed);
      setStatus('ready');
    } catch (e) {
      if (id !== loadId.current) return;
      setError(e instanceof Error ? e.message : 'Could not read this file.');
      setStatus('error');
    }
  };

  const reset = () => {
    loadId.current++;
    setFile(null);
    setRows([]);
    setStatus('idle');
    setOutput([]);
  };

  const header = useMemo(
    () => (hasHeader ? headerNames(rows) : (rows[0] ?? []).map((_, i) => `Column ${columnLabel(i)}`)),
    [rows, hasHeader],
  );
  const body = useMemo(() => (hasHeader ? rows.slice(1) : rows), [rows, hasHeader]);
  const widths = useMemo(() => columnWidths(header, body), [header, body]);
  const searchIndex = useMemo(() => buildSearchIndex(body), [body]);
  const sorted = useMemo(() => sortIndices(body, sort), [body, sort]);
  const view = useMemo(() => filterIndices(sorted, searchIndex, debouncedQuery), [sorted, searchIndex, debouncedQuery]);
  const stats = useMemo(
    () => (statsCol !== null && statsCol < header.length ? columnStats(body, statsCol, view) : null),
    [body, statsCol, view, header.length],
  );

  // Any exported file is stale as soon as the view changes.
  useEffect(() => { setOutput([]); }, [view, header]);

  const exportView = () => {
    const base = file ? stripExtension(file.name) : 'data';
    const viewRows = view.map(i => body[i]);
    setOutput([csvOutputFile(`${base}-view`, hasHeader ? [rows[0], ...viewRows] : viewRows, DEFAULT_CSV_OPTIONS)]);
  };

  return (
    <div className="space-y-5">
      {!file ? (
        <DropZone
          onFiles={handleFile}
          accept=".csv,.tsv,.txt"
          multiple={false}
          label="Drop a CSV file"
          sublabel="Accepts .csv, .tsv, .txt · up to 200 MB"
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
                  {status === 'ready' && ` · ${fmt(body.length)} rows × ${fmt(header.length)} columns`}
                </p>
              </div>
              <Button variant="ghost" size="icon" aria-label="Remove file" onClick={reset}
                className="shrink-0 text-muted-foreground hover:text-red-500">
                <XIcon className="size-4" />
              </Button>
            </div>

            {status === 'parsing' && <p className="text-sm text-muted-foreground" role="status">Parsing…</p>}
            {status === 'error' && (
              <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-4 py-3 rounded-xl">
                {error}
              </p>
            )}

            {status === 'ready' && (
              <>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                  <div className="relative flex-1 min-w-48">
                    <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                    <Input
                      type="search"
                      aria-label="Search rows"
                      placeholder="Search all cells…"
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox id="csv-viewer-header" checked={hasHeader}
                      onCheckedChange={c => { setHasHeader(c); setSort(null); }} />
                    <Label htmlFor="csv-viewer-header" className="font-normal cursor-pointer">First row is header</Label>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground" aria-live="polite">
                    {fmt(view.length)} of {fmt(body.length)} rows
                    {query !== debouncedQuery && ' · searching…'}
                  </p>
                  <Button variant="secondary" size="sm" onClick={exportView} disabled={view.length === 0}>
                    <ExportIcon className="size-3.5" />
                    Export view as CSV
                  </Button>
                </div>

                <VirtualTable
                  header={header}
                  body={body}
                  view={view}
                  widths={widths}
                  sort={sort}
                  onSort={col => setSort(s => nextSort(s, col))}
                />

                <StatsPanel header={header} col={statsCol} onCol={setStatsCol} stats={stats} />
              </>
            )}
          </CardContent>
        </Card>
      )}

      {output.length > 0 && <OutputFiles files={output} />}
    </div>
  );
}

interface TableProps {
  header: string[];
  body: Grid;
  view: number[];
  widths: number[];
  sort: SortState | null;
  onSort: (col: number) => void;
}

function VirtualTable({ header, body, view, widths, sort, onSort }: TableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: view.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    paddingStart: HEADER_H,
    overscan: 12,
  });
  const items = virtualizer.getVirtualItems();
  const padTop = items.length ? items[0].start - HEADER_H : 0;
  const padBottom = items.length ? virtualizer.getTotalSize() - items[items.length - 1].end : 0;
  const totalWidth = ROWNUM_W + widths.reduce((a, b) => a + b, 0);

  // Jump back to the top when the view is re-sorted or re-filtered.
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }); }, [view]);

  const cellBase = 'h-auto py-0 px-2 border-b border-border overflow-hidden text-ellipsis';
  const stickyNum = 'sticky left-0 bg-card border-r text-right tabular-nums text-muted-foreground';

  return (
    <div ref={scrollRef} className="h-[60vh] min-h-72 max-h-[640px] overflow-auto rounded-xl border border-border bg-card dark:scheme-dark">
      <table className="text-sm border-separate border-spacing-0 table-fixed" style={{ width: totalWidth }}>
        <colgroup>
          <col style={{ width: ROWNUM_W }} />
          {widths.map((w, i) => <col key={i} style={{ width: w }} />)}
        </colgroup>
        <TableHeader className="sticky top-0 z-20 bg-card">
          <TableRow className="hover:bg-transparent" style={{ height: HEADER_H }}>
            <TableHead className={cn(cellBase, stickyNum, 'z-30 text-xs')}>#</TableHead>
            {header.map((name, c) => {
              const dir = sort?.col === c ? sort.dir : null;
              const SortGlyph = dir === 'asc' ? ArrowUpIcon : dir === 'desc' ? ArrowDownIcon : ArrowsDownUpIcon;
              return (
                <TableHead
                  key={c}
                  className={cn(cellBase, 'px-1')}
                  aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    title={`Sort by ${name}`}
                    onClick={() => onSort(c)}
                    className="h-7 w-full justify-between gap-1 px-1.5 font-medium"
                  >
                    <span className="truncate">{name}</span>
                    <SortGlyph aria-hidden className={cn('size-3.5 shrink-0', !dir && 'opacity-40')} />
                  </Button>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {padTop > 0 && <tr aria-hidden style={{ height: padTop }} />}
          {items.map(item => {
            const r = view[item.index];
            const row = body[r];
            return (
              <TableRow key={item.key} data-index={item.index} style={{ height: ROW_H }}>
                <TableCell className={cn(cellBase, stickyNum, 'text-xs')}>{r + 1}</TableCell>
                {header.map((_, c) => (
                  <TableCell key={c} className={cellBase} title={row[c]}>{row[c]}</TableCell>
                ))}
              </TableRow>
            );
          })}
          {padBottom > 0 && <tr aria-hidden style={{ height: padBottom }} />}
        </TableBody>
      </table>
      {view.length === 0 && <p className="text-sm text-muted-foreground px-3 py-6 text-center">No matching rows.</p>}
    </div>
  );
}

interface StatsProps {
  header: string[];
  col: number | null;
  onCol: (col: number) => void;
  stats: ColumnStats | null;
}

function StatsPanel({ header, col, onCol, stats }: StatsProps) {
  const items: [string, string][] = stats ? [
    ['Type', stats.type],
    ['Non-empty', fmt(stats.nonEmpty)],
    ['Empty', fmt(stats.empty)],
    ['Unique', fmt(stats.unique)],
    ...(stats.number ? [
      ['Min', fmt(stats.number.min)],
      ['Max', fmt(stats.number.max)],
      ['Mean', fmt(stats.number.mean)],
      ['Sum', fmt(stats.number.sum)],
    ] as [string, string][] : []),
    ...(stats.date ? [['Earliest', stats.date.min], ['Latest', stats.date.max]] as [string, string][] : []),
  ] : [];

  return (
    <section className="space-y-3 rounded-xl border border-border p-4" aria-labelledby="csv-stats-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="csv-stats-heading" className="text-sm font-semibold text-foreground">Column stats</h3>
        <Select value={col === null ? null : String(col)} onValueChange={v => { if (v !== null) onCol(Number(v)); }}>
          <SelectTrigger aria-label="Stats column" className="w-full sm:w-64">
            <SelectValue placeholder="Choose a column">{(v: string | null) => (v === null ? 'Choose a column' : header[Number(v)])}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {header.map((h, i) => <SelectItem key={i} value={String(i)}>{h}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {!stats ? (
        <p className="text-sm text-muted-foreground">Pick a column to see counts, type and value ranges for the rows in view.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-sm">
            {items.map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="font-medium text-foreground truncate tabular-nums" title={v}>{v}</dd>
              </div>
            ))}
          </dl>
          {stats.top.length > 0 && (
            <div className="text-sm min-w-0 sm:w-60">
              <p className="text-xs text-muted-foreground mb-1">Top values</p>
              <ol className="space-y-0.5" aria-label="Top values">
                {stats.top.map(t => (
                  <li key={t.value} className="flex justify-between gap-3">
                    <span className="truncate" title={t.value}>{t.value}</span>
                    <span className="tabular-nums text-muted-foreground">{fmt(t.count)}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
