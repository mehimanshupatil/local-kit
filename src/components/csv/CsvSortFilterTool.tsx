import { useMemo, useState } from 'react';
import { useImmer } from 'use-immer';
import { PlusIcon, TrashIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import DropZone from '@/components/shared/DropZone';
import OutputFiles, { type OutputFile } from '@/components/shared/OutputFiles';
import CsvOptionsFields from '@/components/csv/CsvOptionsFields';
import CsvPreviewTable from '@/components/csv/CsvPreviewTable';
import CsvFileHeader from '@/components/csv/CsvFileHeader';
import { CheckboxField, ColumnSelect, OptionSelect } from '@/components/csv/CsvFields';
import { useCsvFile } from '@/components/csv/useCsvFile';
import { useToolVisit } from '@/stores/toolVisit';
import { generateId, stripExtension } from '@/lib/utils/fileUtils';
import { DEFAULT_CSV_OPTIONS, csvOutputFile, type CsvOptions } from '@/lib/csv/csv';
import { columnDisplayName } from '@/lib/csv/columns';
import {
  FILTER_OPERATORS, operatorNeedsValue, sortAndFilter,
  type FilterCombine, type FilterRule, type SortDirection, type SortRule, type SortType,
} from '@/lib/csv/sortFilter';

type Keyed<T> = T & { id: string };

const DIRECTIONS: { value: SortDirection; label: string }[] = [
  { value: 'asc', label: 'Ascending' },
  { value: 'desc', label: 'Descending' },
];

const SORT_TYPES: { value: SortType; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
];

const COMBINES: { value: FilterCombine; label: string }[] = [
  { value: 'and', label: 'Match all (AND)' },
  { value: 'or', label: 'Match any (OR)' },
];

export default function CsvSortFilterTool() {
  useToolVisit('csv', '/csv/sort-filter');

  const source = useCsvFile();
  const [header, setHeader] = useState(true);
  const [sorts, updateSorts] = useImmer<Keyed<SortRule>[]>([]);
  const [filters, updateFilters] = useImmer<Keyed<FilterRule>[]>([]);
  const [combine, setCombine] = useState<FilterCombine>('and');
  const [options, setOptions] = useState<CsvOptions>(DEFAULT_CSV_OPTIONS);
  const [output, setOutput] = useState<OutputFile[]>([]);

  const { rows } = source;
  const names = useMemo(() => (rows?.[0] ?? []).map((_, i) => columnDisplayName(rows!, i, header)), [rows, header]);
  const result = useMemo(
    () => (rows ? sortAndFilter(rows, { header, sorts, filters, combine }) : null),
    [rows, header, sorts, filters, combine],
  );

  const changed = () => setOutput([]);

  const handleFiles = async (files: File[]) => {
    setOutput([]);
    updateSorts(() => []);
    updateFilters(() => []);
    const parsed = await source.load(files);
    if (parsed) setOptions({ ...DEFAULT_CSV_OPTIONS, delimiter: parsed.delimiter });
  };

  const reset = () => {
    source.reset();
    setOutput([]);
  };

  const editSort = (i: number, patch: Partial<SortRule>) => { updateSorts(d => { Object.assign(d[i], patch); }); changed(); };
  const editFilter = (i: number, patch: Partial<FilterRule>) => { updateFilters(d => { Object.assign(d[i], patch); }); changed(); };

  const create = () => {
    if (!result || !source.file) return;
    setOutput([csvOutputFile(`${stripExtension(source.file.name)}-sorted.csv`, result.rows, options)]);
  };

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

            {result && (
              <>
                <CheckboxField checked={header} onChange={v => { setHeader(v); changed(); }}>
                  First row is header
                </CheckboxField>

                <section className="space-y-3" aria-label="Sort rules">
                  <h3 className="text-sm font-semibold text-foreground">Sort</h3>
                  {sorts.length === 0 && <p className="text-sm text-muted-foreground">Rows keep their original order.</p>}
                  {sorts.map((rule, i) => (
                    <div key={rule.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-2">
                      <span className="text-xs text-muted-foreground w-12 shrink-0">{i === 0 ? 'Sort by' : 'then by'}</span>
                      <ColumnSelect label={`Sort ${i + 1} column`} value={rule.column} names={names}
                        onChange={column => editSort(i, { column })} className="flex-1 min-w-32" />
                      <OptionSelect label={`Sort ${i + 1} direction`} value={rule.direction} options={DIRECTIONS}
                        onChange={direction => editSort(i, { direction })} className="w-auto min-w-32" />
                      <OptionSelect label={`Sort ${i + 1} compare as`} value={rule.type} options={SORT_TYPES}
                        onChange={type => editSort(i, { type })} className="w-auto min-w-24" />
                      <Button variant="ghost" size="icon" aria-label={`Remove sort ${i + 1}`}
                        className="shrink-0 text-muted-foreground hover:text-red-500"
                        onClick={() => { updateSorts(d => { d.splice(i, 1); }); changed(); }}>
                        <TrashIcon className="size-4" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="secondary" size="sm" onClick={() => {
                    updateSorts(d => { d.push({ id: generateId(), column: 0, direction: 'asc', type: 'auto' }); });
                    changed();
                  }}>
                    <PlusIcon className="size-3.5" /> Add sort
                  </Button>
                </section>

                <section className="space-y-3" aria-label="Filter rules">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-foreground">Filter</h3>
                    {filters.length > 1 && (
                      <div className="flex gap-1" role="group" aria-label="Combine filters">
                        {COMBINES.map(c => (
                          <Button key={c.value} size="sm" variant={combine === c.value ? 'default' : 'secondary'}
                            aria-pressed={combine === c.value}
                            onClick={() => { setCombine(c.value); changed(); }}>
                            {c.label}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                  {filters.length === 0 && <p className="text-sm text-muted-foreground">All rows are kept.</p>}
                  {filters.map((rule, i) => (
                    <div key={rule.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-2">
                      <span className="text-xs text-muted-foreground w-12 shrink-0">
                        {i === 0 ? 'Where' : combine === 'and' ? 'and' : 'or'}
                      </span>
                      <ColumnSelect label={`Filter ${i + 1} column`} value={rule.column} names={names}
                        onChange={column => editFilter(i, { column })} className="flex-1 min-w-32" />
                      <OptionSelect label={`Filter ${i + 1} operator`} value={rule.operator} options={FILTER_OPERATORS}
                        onChange={operator => editFilter(i, { operator })} className="w-auto min-w-36" />
                      {operatorNeedsValue(rule.operator) && (
                        <Input aria-label={`Filter ${i + 1} value`} value={rule.value} placeholder="Value"
                          onChange={e => editFilter(i, { value: e.target.value })} className="flex-1 min-w-28" />
                      )}
                      <Button variant="ghost" size="icon" aria-label={`Remove filter ${i + 1}`}
                        className="shrink-0 text-muted-foreground hover:text-red-500"
                        onClick={() => { updateFilters(d => { d.splice(i, 1); }); changed(); }}>
                        <TrashIcon className="size-4" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="secondary" size="sm" onClick={() => {
                    updateFilters(d => { d.push({ id: generateId(), column: 0, operator: 'contains', value: '' }); });
                    changed();
                  }}>
                    <PlusIcon className="size-3.5" /> Add filter
                  </Button>
                </section>

                <p className="text-sm text-muted-foreground" aria-live="polite">
                  {result.matched} of {result.total} {result.total === 1 ? 'row matches' : 'rows match'}
                </p>

                <CsvPreviewTable rows={result.rows} header={header} />

                <CsvOptionsFields options={options} onChange={o => { setOptions(o); changed(); }} />

                <div className="flex flex-wrap gap-3">
                  <Button onClick={create}>Create sorted CSV</Button>
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
