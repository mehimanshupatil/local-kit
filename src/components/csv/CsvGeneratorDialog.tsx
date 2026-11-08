import { useState } from 'react';
import { PlusIcon, XIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { GENERATOR_TYPES, generateRows, type ColumnSpec, type GeneratorType } from '@/lib/csv/dataGenerator';
import type { Grid } from '@/lib/csv/csv';

const MAX_ROWS = 10_000;

const DEFAULT_COLUMNS: ColumnSpec[] = [
  { name: 'id', type: 'sequence' },
  { name: 'name', type: 'fullName' },
  { name: 'email', type: 'email' },
  { name: 'city', type: 'city' },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerate: (rows: Grid) => void;
}

export default function CsvGeneratorDialog({ open, onOpenChange, onGenerate }: Props) {
  const [columns, setColumns] = useState<ColumnSpec[]>(DEFAULT_COLUMNS);
  const [count, setCount] = useState('100');

  const update = (i: number, patch: Partial<ColumnSpec>) =>
    setColumns(cols => cols.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  const rowCount = Math.min(MAX_ROWS, Math.max(1, Math.round(Number(count)) || 1));

  const handleGenerate = () => {
    onGenerate(generateRows(columns, rowCount));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Generate sample data</DialogTitle>
          <DialogDescription>
            Fills the grid with realistic-looking fake rows for testing. Replaces the current grid — you can undo it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {columns.map((col, i) => {
            const params = GENERATOR_TYPES.find(t => t.value === col.type)?.params ?? [];
            return (
              <div key={i} className="flex flex-wrap items-end gap-2 rounded-xl border border-border p-3">
                <div className="space-y-1.5 grow basis-32">
                  <Label htmlFor={`gen-name-${i}`}>Column name</Label>
                  <Input id={`gen-name-${i}`} value={col.name} onChange={e => update(i, { name: e.target.value })} />
                </div>
                <div className="space-y-1.5 grow basis-40">
                  <Label>Type</Label>
                  <Select value={col.type} onValueChange={v => v && update(i, { type: v as GeneratorType })}>
                    <SelectTrigger className="w-full" aria-label={`Type for column ${i + 1}`}>
                      <SelectValue>{(v: GeneratorType) => GENERATOR_TYPES.find(t => t.value === v)?.label}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {GENERATOR_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {params.includes('range') && (
                  <>
                    <div className="space-y-1.5 w-24">
                      <Label htmlFor={`gen-min-${i}`}>Min</Label>
                      <Input id={`gen-min-${i}`} type="number" value={col.min ?? 0}
                        onChange={e => update(i, { min: Number(e.target.value) })} />
                    </div>
                    <div className="space-y-1.5 w-24">
                      <Label htmlFor={`gen-max-${i}`}>Max</Label>
                      <Input id={`gen-max-${i}`} type="number" value={col.max ?? 1000}
                        onChange={e => update(i, { max: Number(e.target.value) })} />
                    </div>
                  </>
                )}
                {params.includes('start') && (
                  <div className="space-y-1.5 w-24">
                    <Label htmlFor={`gen-start-${i}`}>Start at</Label>
                    <Input id={`gen-start-${i}`} type="number" value={col.min ?? 1}
                      onChange={e => update(i, { min: Number(e.target.value) })} />
                  </div>
                )}
                {params.includes('dates') && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor={`gen-from-${i}`}>From</Label>
                      <Input id={`gen-from-${i}`} type="date" value={col.from ?? '2020-01-01'}
                        onChange={e => update(i, { from: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`gen-to-${i}`}>To</Label>
                      <Input id={`gen-to-${i}`} type="date" value={col.to ?? '2026-12-31'}
                        onChange={e => update(i, { to: e.target.value })} />
                    </div>
                  </>
                )}
                {params.includes('options') && (
                  <div className="space-y-1.5 grow basis-48">
                    <Label htmlFor={`gen-options-${i}`}>Choices (comma-separated)</Label>
                    <Input id={`gen-options-${i}`} placeholder="small, medium, large" value={col.options ?? ''}
                      onChange={e => update(i, { options: e.target.value })} />
                  </div>
                )}
                <Button variant="ghost" size="icon-sm" aria-label={`Remove column ${i + 1}`} disabled={columns.length === 1}
                  className="text-muted-foreground hover:text-red-500"
                  onClick={() => setColumns(cols => cols.filter((_, j) => j !== i))}>
                  <XIcon />
                </Button>
              </div>
            );
          })}
          <Button variant="outline" size="sm"
            onClick={() => setColumns(cols => [...cols, { name: `column_${cols.length + 1}`, type: 'words' }])}>
            <PlusIcon /> Add column
          </Button>
        </div>

        <DialogFooter className="items-end sm:justify-between">
          <div className="space-y-1.5">
            <Label htmlFor="gen-count">Rows (1–{MAX_ROWS.toLocaleString()})</Label>
            <Input id="gen-count" type="number" min={1} max={MAX_ROWS} inputMode="numeric" className="w-32"
              value={count} onChange={e => setCount(e.target.value)} />
          </div>
          <Button onClick={handleGenerate}>Generate {rowCount.toLocaleString()} rows</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
