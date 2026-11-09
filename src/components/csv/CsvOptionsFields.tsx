import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DELIMITERS, type CsvOptions, type Delimiter, type LineEnding } from '@/lib/csv/csv';

const LINE_ENDINGS: { value: LineEnding; label: string }[] = [
  { value: '\r\n', label: 'Windows (CRLF)' },
  { value: '\n', label: 'Unix (LF)' },
];

interface Props {
  options: CsvOptions;
  onChange: (options: CsvOptions) => void;
}

export default function CsvOptionsFields({ options, onChange }: Props) {
  const set = <K extends keyof CsvOptions>(key: K, value: CsvOptions[K]) => onChange({ ...options, [key]: value });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="space-y-1.5">
        <Label>Delimiter</Label>
        <Select value={options.delimiter} onValueChange={v => v && set('delimiter', v as Delimiter)}>
          <SelectTrigger className="w-full">
            <SelectValue>{(v: Delimiter) => DELIMITERS.find(d => d.value === v)?.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {DELIMITERS.map(d => (
              <SelectItem key={d.label} value={d.value}>{d.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Line endings</Label>
        <Select value={options.lineEnding} onValueChange={v => v && set('lineEnding', v as LineEnding)}>
          <SelectTrigger className="w-full">
            <SelectValue>{(v: LineEnding) => LINE_ENDINGS.find(l => l.value === v)?.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {LINE_ENDINGS.map(l => (
              <SelectItem key={l.label} value={l.value}>{l.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Label className="flex items-center gap-2 font-normal">
        <Checkbox checked={options.quoteAll} onCheckedChange={c => set('quoteAll', c)} />
        Quote every field
      </Label>
      <Label className="flex items-center gap-2 font-normal">
        <Checkbox checked={options.bom} onCheckedChange={c => set('bom', c)} />
        Add UTF-8 BOM (for Excel)
      </Label>
    </div>
  );
}
