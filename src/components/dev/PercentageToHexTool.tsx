import { useImmer } from 'use-immer';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToolVisit } from '@/stores/toolVisit';
import { TRIO_PARSERS, type ByteField, type ByteTrio } from '@/lib/dev/percentageToHex';

const FIELDS: { key: ByteField; label: string; placeholder: string }[] = [
  { key: 'percent', label: 'Percent (0–100)', placeholder: 'e.g. 35' },
  { key: 'hex', label: 'Hex (00–FF)', placeholder: 'e.g. 59' },
  { key: 'decimal', label: 'Decimal (0–255)', placeholder: 'e.g. 89' },
];

const EMPTY_STATE: ByteTrio = { percent: '', hex: '', decimal: '' };

export default function PercentageToHexTool() {
  useToolVisit('dev', '/dev/percentage-to-hex');

  const [state, update] = useImmer<ByteTrio>(EMPTY_STATE);

  function handleChange(field: ByteField, value: string) {
    if (!value.trim()) {
      update(() => ({ ...EMPTY_STATE }));
      return;
    }
    const trio = TRIO_PARSERS[field](value);
    if (!trio) {
      // Invalid for conversion purposes, but the field itself must still
      // reflect what was typed — otherwise this field's displayed value
      // silently drifts from React state (state never re-renders the DOM
      // back to the last valid value without an update() call here).
      update(d => { d[field] = value; });
      return;
    }
    update(() => ({ ...trio, [field]: value }));
  }

  return (
    <Card>
      <CardContent className="pt-5 pb-4 space-y-4">
        {FIELDS.map(({ key, label, placeholder }) => (
          <div key={key} className="space-y-1.5">
            <Label htmlFor={`byte-${key}`}>{label}</Label>
            <Input
              id={`byte-${key}`}
              value={state[key]}
              onChange={e => handleChange(key, e.target.value)}
              spellCheck={false}
              className="font-mono"
              placeholder={placeholder}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
