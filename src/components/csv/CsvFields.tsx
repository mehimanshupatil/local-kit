import { useId, type ReactNode } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils/cn';

/** Checkbox with a clickable label wired via htmlFor, so it has an accessible name. */
export function CheckboxField({ checked, onChange, children, disabled, className }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={c => onChange(c)} />
      <Label htmlFor={id} className={cn('font-normal cursor-pointer', disabled && 'opacity-50')}>{children}</Label>
    </div>
  );
}

/** Generic labelled select over string values. */
export function OptionSelect<T extends string>({ label, value, options, onChange, className }: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={v => v !== null && onChange(v as T)}>
      <SelectTrigger aria-label={label} className={cn('w-full', className)}>
        <SelectValue>{(v: T) => options.find(o => o.value === v)?.label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

/** Select a column by index; `names` are the display names in column order. */
export function ColumnSelect({ label, value, names, onChange, className }: {
  label: string;
  value: number;
  names: string[];
  onChange: (index: number) => void;
  className?: string;
}) {
  return (
    <OptionSelect
      label={label}
      value={String(value)}
      options={names.map((n, i) => ({ value: String(i), label: n }))}
      onChange={v => onChange(Number(v))}
      className={className}
    />
  );
}
