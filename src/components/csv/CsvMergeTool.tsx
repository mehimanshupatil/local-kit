import { useMemo, useState } from 'react';
import { useImmer } from 'use-immer';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DotsSixVerticalIcon, FileCsvIcon, XIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import DropZone from '@/components/shared/DropZone';
import OutputFiles from '@/components/shared/OutputFiles';
import CsvOptionsFields from '@/components/csv/CsvOptionsFields';
import CsvPreviewTable from '@/components/csv/CsvPreviewTable';
import { useToolVisit } from '@/stores/toolVisit';
import { type ToolOp, IDLE_OP } from '@/lib/utils/toolState';
import { formatFileSize, generateId } from '@/lib/utils/fileUtils';
import { cn } from '@/lib/utils/cn';
import { DEFAULT_CSV_OPTIONS, DELIMITERS, csvOutputFile, readCsvFile, type CsvOptions, type Delimiter, type Grid } from '@/lib/csv/csv';
import { DEFAULT_MERGE_OPTIONS, mergeCsvs, type ColumnMatch, type MergeOptions } from '@/lib/csv/merge';

const PREVIEW_ROWS = 10;

interface CsvEntry {
  id: string;
  name: string;
  size: number;
  rows: Grid;
  delimiter: Delimiter;
}

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;
const delimiterName = (d: Delimiter) => DELIMITERS.find(x => x.value === d)?.label.replace(/ \(.\)$/, '').toLowerCase() ?? d;

function SortableFileRow({ entry, index, hasHeader, onRemove }: {
  entry: CsvEntry; index: number; hasHeader: boolean; onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.id });
  const dataRows = Math.max(0, entry.rows.length - (hasHeader ? 1 : 0));
  const cols = entry.rows[0]?.length ?? 0;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2.5 rounded-xl border-2 bg-card transition-colors',
        isDragging ? 'relative z-50 border-brand-500 shadow-lg opacity-90' : 'border-border',
      )}
    >
      <Button
        {...attributes}
        {...listeners}
        variant="ghost"
        size="icon"
        aria-label={`Reorder ${entry.name}`}
        className="shrink-0 touch-none cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
      >
        <DotsSixVerticalIcon className="size-4" />
      </Button>
      <span className="text-xs text-muted-foreground font-mono w-5 text-center shrink-0">{index + 1}</span>
      <FileCsvIcon className="hidden sm:block size-5 shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{entry.name}</p>
        <p className="text-xs text-muted-foreground">
          {plural(dataRows, 'row')} · {plural(cols, 'column')} · {delimiterName(entry.delimiter)} · {formatFileSize(entry.size)}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Remove ${entry.name}`}
        onClick={() => onRemove(entry.id)}
        className="shrink-0 text-muted-foreground hover:text-red-500"
      >
        <XIcon className="size-4" />
      </Button>
    </li>
  );
}

export default function CsvMergeTool() {
  useToolVisit('csv', '/csv/merge');

  const [entries, setEntries] = useState<CsvEntry[]>([]);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [merge, setMerge] = useState<MergeOptions>(DEFAULT_MERGE_OPTIONS);
  const [options, setOptions] = useState<CsvOptions>(DEFAULT_CSV_OPTIONS);
  const [op, updateOp] = useImmer<ToolOp>({ ...IDLE_OP });
  const { output } = op;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const clearOutput = () => updateOp(() => ({ ...IDLE_OP }));

  const result = useMemo(
    () => (entries.length ? mergeCsvs(entries.map(e => ({ name: e.name, rows: e.rows })), merge) : null),
    [entries, merge],
  );

  const addFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setLoading(true);
    const added: CsvEntry[] = [];
    const errors: string[] = [];
    for (const f of files) {
      try {
        const { rows, delimiter } = await readCsvFile(f);
        added.push({ id: generateId(), name: f.name, size: f.size, rows, delimiter });
      } catch (e) {
        errors.push(`${f.name}: ${e instanceof Error ? e.message : 'could not be read'}`);
      }
    }
    setLoadErrors(errors);
    setLoading(false);
    if (added.length === 0) return;
    // Default the export delimiter to the first input's
    if (entries.length === 0) setOptions({ ...DEFAULT_CSV_OPTIONS, delimiter: added[0].delimiter });
    setEntries(prev => [...prev, ...added]);
    clearOutput();
  };

  const remove = (id: string) => { setEntries(prev => prev.filter(e => e.id !== id)); clearOutput(); };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setEntries(prev => arrayMove(prev, prev.findIndex(e => e.id === active.id), prev.findIndex(e => e.id === over.id)));
    clearOutput();
  };

  const setMergeOption = <K extends keyof MergeOptions>(key: K, value: MergeOptions[K]) => {
    setMerge(m => ({ ...m, [key]: value }));
    clearOutput();
  };

  const runMerge = () => {
    if (!result) return;
    updateOp(d => { d.output = [csvOutputFile('merged.csv', result.rows, options)]; d.status = 'done'; });
  };

  const reset = () => {
    setEntries([]);
    setLoadErrors([]);
    updateOp(() => ({ ...IDLE_OP }));
  };

  return (
    <div className="space-y-5">
      <DropZone
        onFiles={addFiles}
        accept=".csv,.tsv,.txt"
        label="Drop CSV files"
        sublabel="Add 2 or more .csv, .tsv or .txt files — drag rows to reorder"
      />

      {loading && <p className="text-sm text-muted-foreground">Reading files…</p>}
      {loadErrors.length > 0 && (
        <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-4 py-3 rounded-xl space-y-1">
          {loadErrors.map(msg => <p key={msg}>{msg}</p>)}
        </div>
      )}

      {entries.length > 0 && result && (
        <Card>
          <CardContent className="pt-5 space-y-5">
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {plural(entries.length, 'file')}
                {entries.length > 1 && ' · drag to reorder'}
              </p>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={entries.map(e => e.id)} strategy={verticalListSortingStrategy}>
                  <ol className="space-y-2" aria-label="Files to merge">
                    {entries.map((entry, i) => (
                      <SortableFileRow key={entry.id} entry={entry} index={i} hasHeader={merge.hasHeader} onRemove={remove} />
                    ))}
                  </ol>
                </SortableContext>
              </DndContext>
            </div>

            <div className="space-y-3">
              <Label className="flex items-center gap-2 font-normal">
                <Checkbox checked={merge.hasHeader} onCheckedChange={c => setMergeOption('hasHeader', c)} />
                First row is header
              </Label>

              <div className="space-y-1.5">
                <Label>Match columns</Label>
                <Tabs
                  value={merge.hasHeader ? merge.match : 'position'}
                  onValueChange={v => setMergeOption('match', v as ColumnMatch)}
                >
                  <TabsList className="w-full sm:w-auto">
                    <TabsTrigger value="name" disabled={!merge.hasHeader}>By header name</TabsTrigger>
                    <TabsTrigger value="position">By position</TabsTrigger>
                  </TabsList>
                </Tabs>
                <p className="text-xs text-muted-foreground">
                  {merge.hasHeader && merge.match === 'name'
                    ? 'Columns with the same header (ignoring case and spaces) are lined up; missing ones are left blank.'
                    : 'Column 1 goes under column 1, column 2 under column 2, and so on.'}
                </p>
              </div>

              <Label className="flex items-center gap-2 font-normal">
                <Checkbox checked={merge.addSource} onCheckedChange={c => setMergeOption('addSource', c)} />
                Add a <code className="font-mono text-xs">source_file</code> column
              </Label>
              <Label className="flex items-center gap-2 font-normal">
                <Checkbox checked={merge.dedupe} onCheckedChange={c => setMergeOption('dedupe', c)} />
                Remove duplicate rows
              </Label>
            </div>

            <div className="space-y-2">
              <p className="text-sm text-muted-foreground" aria-live="polite">
                Result: <span className="font-medium text-foreground">{plural(result.dataRows, 'row')} × {plural(result.columns, 'column')}</span>
                {merge.dedupe && ` · ${plural(result.duplicatesRemoved, 'duplicate')} removed`}
              </p>
              <CsvPreviewTable rows={result.rows} header={merge.hasHeader} maxRows={PREVIEW_ROWS} />
            </div>

            <CsvOptionsFields options={options} onChange={o => { setOptions(o); clearOutput(); }} />

            <div className="flex flex-wrap gap-3">
              <Button onClick={runMerge} disabled={entries.length < 2}>
                {entries.length < 2 ? 'Add another file to merge' : `Merge ${entries.length} files`}
              </Button>
              <Button variant="secondary" onClick={reset}>Reset</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {output.length > 0 && <OutputFiles files={output} />}
    </div>
  );
}
