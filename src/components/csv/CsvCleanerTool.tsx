import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import DropZone from '@/components/shared/DropZone';
import OutputFiles, { type OutputFile } from '@/components/shared/OutputFiles';
import CsvOptionsFields from '@/components/csv/CsvOptionsFields';
import CsvPreviewTable from '@/components/csv/CsvPreviewTable';
import CsvFileHeader from '@/components/csv/CsvFileHeader';
import { CheckboxField, OptionSelect } from '@/components/csv/CsvFields';
import { useCsvFile } from '@/components/csv/useCsvFile';
import { useToolVisit } from '@/stores/toolVisit';
import { stripExtension } from '@/lib/utils/fileUtils';
import { DEFAULT_CSV_OPTIONS, csvOutputFile, type CsvOptions } from '@/lib/csv/csv';
import { DEFAULT_CLEAN_OPTIONS, cleanGrid, type CleanOptions, type TextCase } from '@/lib/csv/cleaner';
import { columnDisplayName } from '@/lib/csv/columns';

const CASES: { value: TextCase; label: string }[] = [
  { value: 'none', label: 'Leave as is' },
  { value: 'lower', label: 'lowercase' },
  { value: 'upper', label: 'UPPERCASE' },
  { value: 'title', label: 'Title Case' },
];

const ALL_COLUMNS = 'all';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export default function CsvCleanerTool() {
  useToolVisit('csv', '/csv/cleaner');

  const source = useCsvFile();
  const [clean, setClean] = useState<CleanOptions>(DEFAULT_CLEAN_OPTIONS);
  const [options, setOptions] = useState<CsvOptions>(DEFAULT_CSV_OPTIONS);
  const [output, setOutput] = useState<OutputFile[]>([]);

  const { rows } = source;
  const result = useMemo(() => (rows ? cleanGrid(rows, clean) : null), [rows, clean]);
  const names = useMemo(() => (rows?.[0] ?? []).map((_, i) => columnDisplayName(rows!, i, clean.header)), [rows, clean.header]);

  const set = <K extends keyof CleanOptions>(key: K, value: CleanOptions[K]) => {
    setClean(c => ({ ...c, [key]: value }));
    setOutput([]);
  };

  const handleFiles = async (files: File[]) => {
    setOutput([]);
    setClean(c => ({ ...c, caseColumn: null }));
    const parsed = await source.load(files);
    if (parsed) setOptions({ ...DEFAULT_CSV_OPTIONS, delimiter: parsed.delimiter });
  };

  const reset = () => {
    source.reset();
    setOutput([]);
  };

  const create = () => {
    if (!result || !source.file) return;
    setOutput([csvOutputFile(`${stripExtension(source.file.name)}-clean.csv`, result.rows, options)]);
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
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">Clean up</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <CheckboxField checked={clean.header} onChange={v => set('header', v)}>
                      First row is header
                    </CheckboxField>
                    <CheckboxField checked={clean.trim} onChange={v => set('trim', v)}>
                      Trim leading/trailing whitespace
                    </CheckboxField>
                    <CheckboxField checked={clean.collapseSpaces} onChange={v => set('collapseSpaces', v)}>
                      Collapse repeated spaces
                    </CheckboxField>
                    <CheckboxField checked={clean.invisible} onChange={v => set('invisible', v)}>
                      Replace invisible characters
                    </CheckboxField>
                    <CheckboxField checked={clean.removeEmptyRows} onChange={v => set('removeEmptyRows', v)}>
                      Remove empty rows
                    </CheckboxField>
                    <CheckboxField checked={clean.removeEmptyColumns} onChange={v => set('removeEmptyColumns', v)}>
                      Remove empty columns
                    </CheckboxField>
                    <div className="space-y-2">
                      <CheckboxField checked={clean.dedupe} onChange={v => set('dedupe', v)}>
                        Remove duplicate rows
                      </CheckboxField>
                      <CheckboxField checked={clean.dedupeIgnoreCase} disabled={!clean.dedupe}
                        onChange={v => set('dedupeIgnoreCase', v)} className="pl-6">
                        Ignore case when comparing
                      </CheckboxField>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Text case</Label>
                    <OptionSelect label="Text case" value={clean.textCase} options={CASES} onChange={v => set('textCase', v)} />
                  </div>
                  {clean.textCase !== 'none' && (
                    <div className="space-y-1.5">
                      <Label>Apply case to</Label>
                      <OptionSelect
                        label="Apply case to"
                        value={clean.caseColumn === null ? ALL_COLUMNS : String(clean.caseColumn)}
                        options={[{ value: ALL_COLUMNS, label: 'All columns' }, ...names.map((n, i) => ({ value: String(i), label: n }))]}
                        onChange={v => set('caseColumn', v === ALL_COLUMNS ? null : Number(v))}
                      />
                    </div>
                  )}
                </div>

                <p className="text-sm text-muted-foreground" aria-live="polite">
                  {plural(result.cellsChanged, 'cell')} changed · {plural(result.rowsRemoved, 'row')} removed · {plural(result.columnsRemoved, 'column')} removed
                </p>

                <CsvPreviewTable rows={result.rows} header={clean.header} />

                <CsvOptionsFields options={options} onChange={o => { setOptions(o); setOutput([]); }} />

                <div className="flex flex-wrap gap-3">
                  <Button onClick={create}>Create cleaned CSV</Button>
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
