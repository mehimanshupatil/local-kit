import { useState } from 'react';
import { useImmer } from 'use-immer';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToolVisit } from '@/stores/toolVisit';
import { BASES, convertFromBase, isValidForBase, type Base } from '@/lib/dev/numberBaseConverter';

type State = Record<Base, string>;

const EMPTY_STATE: State = { bin: '', oct: '', dec: '', hex: '' };

export default function NumberBaseConverterTool() {
  useToolVisit('dev', '/dev/number-base-converter');

  const [state, update] = useImmer<State>(EMPTY_STATE);
  const [invalidBase, setInvalidBase] = useState<Base | null>(null);

  function handleChange(base: Base, value: string) {
    if (!value) {
      update(() => ({ ...EMPTY_STATE }));
      setInvalidBase(null);
      return;
    }
    if (!isValidForBase(value, base)) {
      update(d => { d[base] = value; });
      setInvalidBase(base);
      return;
    }
    const result = convertFromBase(value, base);
    if (!result) {
      setInvalidBase(base);
      return;
    }
    update(() => ({ ...result, [base]: value }));
    setInvalidBase(null);
  }

  return (
    <Card>
      <CardContent className="pt-5 pb-4 space-y-4">
        {BASES.map(({ key, label }) => (
          <div key={key} className="space-y-1.5">
            <Label htmlFor={`base-${key}`}>{label}</Label>
            <Input
              id={`base-${key}`}
              value={state[key]}
              onChange={e => handleChange(key, e.target.value)}
              spellCheck={false}
              className="font-mono"
              placeholder={`Enter a ${label.toLowerCase()} value…`}
            />
            {invalidBase === key && (
              <p className="text-xs text-red-500">Invalid {label.toLowerCase()} value</p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
