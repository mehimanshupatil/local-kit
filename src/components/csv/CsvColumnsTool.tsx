import { useMemo, useState } from 'react';
import { useImmer } from 'use-immer';
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowCounterClockwiseIcon, ArrowDownIcon, ArrowUpIcon, DotsSixVerticalIcon, PlusIcon, TrashIcon,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import DropZone from '@/components/shared/DropZone';
import OutputFiles, { type OutputFile } from '@/components/shared/OutputFiles';
import CsvOptionsFields from '@/components/csv/CsvOptionsFields';
import CsvPreviewTable from '@/components/csv/CsvPreviewTable';
import CsvFileHeader from '@/components/csv/CsvFileHeader';
import { CheckboxField, ColumnSelect } from '@/components/csv/CsvFields';
import { useCsvFile } from '@/components/csv/useCsvFile';
import { useToolVisit } from '@/stores/toolVisit';
import { cn } from '@/lib/utils/cn';
import { generateId, stripExtension } from '@/lib/utils/fileUtils';
import { DEFAULT_CSV_OPTIONS, csvOutputFile, type CsvOptions, type Grid } from '@/lib/csv/csv';
import {
  applyColumnSpecs, columnDisplayName, initialColumnSpecs, joinColumns, splitColumn, type ColumnSpec,
} from '@/lib/csv/columns';

type Spec = ColumnSpec & { id: string };

const keyedSpecs = (rows: Grid, header: boolean): Spec[] =>
  initialColumnSpecs(rows, header).map(s => ({ ...s, id: generateId() }));

// ── Sortable column row ───────────────────────────────────────────
function ColumnRow({ spec, label, index, count, header, onChange, onMove }: {
  spec: Spec;
  label: string;
  index: number;
  count: number;
  header: boolean;
  onChange: (patch: Partial<ColumnSpec>) => void;
  onMove: (to: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: spec.id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-center gap-2 px-2 py-1.5 rounded-xl border-2 bg-card',
        isDragging ? 'border-brand-500 shadow-lg opacity-90 z-50' : 'border-border',
        !spec.keep && 'opacity-60',
      )}
    >
      <Button {...attributes} {...listeners} variant="ghost" size="icon" aria-label={`Drag ${label}`}
        className="touch-none cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0">
        <DotsSixVerticalIcon className="size-4" />
      </Button>
      <Checkbox aria-label={`Keep ${label}`} checked={spec.keep} onCheckedChange={c => onChange({ keep: c })} />
      {header ? (
        <Input aria-label={`Name for ${label}`} value={spec.name} onChange={e => onChange({ name: e.target.value })}
          className={cn('flex-1 min-w-0 h-8', !spec.keep && 'line-through')} />
      ) : (
        <span className={cn('flex-1 min-w-0 truncate text-sm', !spec.keep && 'line-through')}>{label}</span>
      )}
      <Button variant="ghost" size="icon" aria-label={`Move ${label} up`} disabled={index === 0}
        onClick={() => onMove(index - 1)} className="shrink-0 text-muted-foreground">
        <ArrowUpIcon className="size-4" />
      </Button>
      <Button variant="ghost" size="icon" aria-label={`Move ${label} down`} disabled={index === count - 1}
        onClick={() => onMove(index + 1)} className="shrink-0 text-muted-foreground">
        <ArrowDownIcon className="size-4" />
      </Button>
    </li>
  );
}

// ── Main tool ─────────────────────────────────────────────────────
export default function CsvColumnsTool() {
  useToolVisit('csv', '/csv/columns');

  const source = useCsvFile();
  const [header, setHeader] = useState(true);
  /** Grid after any split/join steps — the column list edits apply on top of this */
  const [working, setWorking] = useState<Grid | null>(null);
  const [specs, updateSpecs] = useImmer<Spec[]>([]);
  const [options, setOptions] = useState<CsvOptions>(DEFAULT_CSV_OPTIONS);
  const [output, setOutput] = useState<OutputFile[]>([]);

  const [splitCol, setSplitCol] = useState(0);
  const [splitSep, setSplitSep] = useState(',');
  const [splitKeep, setSplitKeep] = useState(false);

  const [joinCols, setJoinCols] = useState<number[]>([0, 1]);
  const [joinSep, setJoinSep] = useState(' ');
  const [joinName, setJoinName] = useState('');
  const [joinKeep, setJoinKeep] = useState(false);
  const [joinSkipEmpty, setJoinSkipEmpty] = useState(true);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const result = useMemo(() => (working ? applyColumnSpecs(working, specs, header) : null), [working, specs, header]);
  const sourceLabels = useMemo(
    () => (working?.[0] ?? []).map((_, i) => columnDisplayName(working!, i, header)),
    [working, header],
  );
  /** Names of the columns as they currently appear in the preview — what split/join pick from */
  const resultNames = useMemo(
    () => (result?.[0] ?? []).map((_, i) => columnDisplayName(result!, i, header)),
    [result, header],
  );
  const width = resultNames.length;

  const changed = () => setOutput([]);

  /** Make `grid` the new base: column list resets, split/join pickers re-point at valid columns. */
  const rebase = (grid: Grid, hdr = header) => {
    setWorking(grid);
    updateSpecs(() => keyedSpecs(grid, hdr));
    setSplitCol(0);
    setJoinCols((grid[0]?.length ?? 0) > 1 ? [0, 1] : [0]);
    setJoinName('');
    changed();
  };

  const handleFiles = async (files: File[]) => {
    setOutput([]);
    setWorking(null);
    const parsed = await source.load(files);
    if (parsed) {
      setOptions({ ...DEFAULT_CSV_OPTIONS, delimiter: parsed.delimiter });
      rebase(parsed.rows);
    }
  };

  const reset = () => {
    source.reset();
    setWorking(null);
    setOutput([]);
  };

  const toggleHeader = (on: boolean) => {
    setHeader(on);
    // Names come from the first row, so refresh them when the header meaning changes
    if (working) updateSpecs(d => { d.forEach(s => { s.name = on ? working[0][s.source] ?? '' : ''; }); });
    changed();
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= specs.length) return;
    updateSpecs(d => { const [moved] = d.splice(from, 1); d.splice(to, 0, moved); });
    changed();
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    move(specs.findIndex(s => s.id === active.id), specs.findIndex(s => s.id === over.id));
  };

  const doSplit = () => {
    if (!result || !splitSep) return;
    rebase(splitColumn(result, { column: splitCol, separator: splitSep, keepOriginal: splitKeep, header }));
  };

  const joinDefaultName = joinCols.map(c => resultNames[c] ?? '').join(' ');
  const doJoin = () => {
    if (!result || joinCols.length < 2) return;
    rebase(joinColumns(result, {
      columns: joinCols, separator: joinSep, name: joinName.trim() || joinDefaultName,
      keepOriginals: joinKeep, skipEmpty: joinSkipEmpty, header,
    }));
  };

  const create = () => {
    if (!result || !source.file) return;
    setOutput([csvOutputFile(`${stripExtension(source.file.name)}-columns.csv`, result, options)]);
  };

  const keptCount = specs.filter(s => s.keep).length;

  return (
    <div className="space-y-5">
      {!source.file ? (
        <DropZone
          onFiles={handleFiles}
          accept=".csv,.tsv,.txt"
          multiple={false}
          label="Drop a CSV file"
          sublabel="Accepts .csv, .tsv, .txt · delimiter is detected automatically"
        />
      ) : (
        <Card>
          <CardContent className="pt-5 space-y-5">
            <CsvFileHeader source={source} onRemove={reset} />

            {working && result && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CheckboxField checked={header} onChange={toggleHeader}>First row is header</CheckboxField>
                  <Button variant="ghost" size="sm" onClick={() => source.rows && rebase(source.rows)}>
                    <ArrowCounterClockwiseIcon className="size-3.5" /> Reset all changes
                  </Button>
                </div>

                <section className="space-y-2" aria-label="Columns">
                  <h3 className="text-sm font-semibold text-foreground">
                    Columns <span className="font-normal text-muted-foreground">· {keptCount} of {specs.length} kept · drag to reorder</span>
                  </h3>
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                    <SortableContext items={specs.map(s => s.id)} strategy={verticalListSortingStrategy}>
                      <ul className="space-y-1.5 max-h-96 overflow-y-auto">
                        {specs.map((spec, i) => (
                          <ColumnRow
                            key={spec.id}
                            spec={spec}
                            label={sourceLabels[spec.source] ?? `Column ${spec.source + 1}`}
                            index={i}
                            count={specs.length}
                            header={header}
                            onChange={patch => { updateSpecs(d => { Object.assign(d[i], patch); }); changed(); }}
                            onMove={to => move(i, to)}
                          />
                        ))}
                      </ul>
                    </SortableContext>
                  </DndContext>
                </section>

                {width > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <section className="space-y-3 rounded-xl border border-border p-3" aria-label="Split a column">
                      <h3 className="text-sm font-semibold text-foreground">Split a column</h3>
                      <div className="space-y-1.5">
                        <Label>Column</Label>
                        <ColumnSelect label="Column to split" value={Math.min(splitCol, width - 1)} names={resultNames}
                          onChange={setSplitCol} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="split-separator">Split on</Label>
                        <Input id="split-separator" value={splitSep} onChange={e => setSplitSep(e.target.value)} placeholder="e.g. , or space" />
                      </div>
                      <CheckboxField checked={splitKeep} onChange={setSplitKeep}>Keep original column</CheckboxField>
                      <Button variant="secondary" size="sm" disabled={!splitSep} onClick={doSplit}>Split column</Button>
                    </section>

                    <section className="space-y-3 rounded-xl border border-border p-3" aria-label="Join columns">
                      <h3 className="text-sm font-semibold text-foreground">Join columns</h3>
                      {width < 2 ? (
                        <p className="text-sm text-muted-foreground">Needs at least two columns.</p>
                      ) : (
                        <>
                          <div className="space-y-1.5">
                            <Label>Columns, in order</Label>
                            {joinCols.map((c, i) => (
                              <div key={i} className="flex items-center gap-2">
                                <ColumnSelect label={`Join column ${i + 1}`} value={Math.min(c, width - 1)} names={resultNames}
                                  onChange={v => setJoinCols(cols => cols.map((x, j) => (j === i ? v : x)))} className="flex-1 min-w-0" />
                                <Button variant="ghost" size="icon" aria-label={`Remove join column ${i + 1}`}
                                  disabled={joinCols.length <= 2}
                                  onClick={() => setJoinCols(cols => cols.filter((_, j) => j !== i))}
                                  className="shrink-0 text-muted-foreground hover:text-red-500">
                                  <TrashIcon className="size-4" />
                                </Button>
                              </div>
                            ))}
                            <Button variant="ghost" size="sm" onClick={() => setJoinCols(cols => {
                              const unused = resultNames.findIndex((_, k) => !cols.includes(k));
                              return [...cols, unused === -1 ? 0 : unused];
                            })}>
                              <PlusIcon className="size-3.5" /> Add column
                            </Button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1.5">
                              <Label htmlFor="join-separator">Separator</Label>
                              <Input id="join-separator" value={joinSep} onChange={e => setJoinSep(e.target.value)} />
                            </div>
                            {header && (
                              <div className="space-y-1.5">
                                <Label htmlFor="join-name">New column name</Label>
                                <Input id="join-name" value={joinName} placeholder={joinDefaultName}
                                  onChange={e => setJoinName(e.target.value)} />
                              </div>
                            )}
                          </div>
                          <CheckboxField checked={joinSkipEmpty} onChange={setJoinSkipEmpty}>Skip empty values</CheckboxField>
                          <CheckboxField checked={joinKeep} onChange={setJoinKeep}>Keep original columns</CheckboxField>
                          <Button variant="secondary" size="sm" onClick={doJoin}>Join columns</Button>
                        </>
                      )}
                    </section>
                  </div>
                )}

                <CsvPreviewTable rows={result} header={header} />

                <CsvOptionsFields options={options} onChange={o => { setOptions(o); changed(); }} />

                <div className="flex flex-wrap gap-3">
                  <Button onClick={create} disabled={keptCount === 0}>Create CSV</Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {output.length > 0 && <OutputFiles files={output} />}
    </div>
  );
}
