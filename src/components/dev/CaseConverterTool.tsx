import { useMemo, useState } from 'react';
import { useClipboard } from '@mantine/hooks';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToolVisit } from '@/stores/toolVisit';
import { convertCase } from '@/lib/dev/caseConverter';
import { CopyIcon, CheckIcon } from '@phosphor-icons/react';

function CopyButton({ value }: { value: string }) {
  const clipboard = useClipboard({ timeout: 2000 });
  return (
    <Button variant="ghost" size="sm" onClick={() => clipboard.copy(value)} className="h-7 px-2 text-xs gap-1.5 shrink-0">
      {clipboard.copied
        ? <><CheckIcon className="size-3 text-green-500" /> Copied</>
        : <><CopyIcon className="size-3" /> Copy</>}
    </Button>
  );
}

export default function CaseConverterTool() {
  useToolVisit('dev', '/dev/case-converter');

  const [input, setInput] = useState('');
  const results = useMemo(() => convertCase(input), [input]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-5 pb-4 space-y-1.5">
          <Label htmlFor="case-input">Input</Label>
          <Input
            id="case-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Type or paste text — e.g. hello world, helloWorld, hello_world…"
          />
        </CardContent>
      </Card>

      {results.length > 0 && (
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="rounded-xl border border-border overflow-hidden">
              {results.map((r, i) => (
                <div key={r.key} className={`flex items-center justify-between gap-2 p-3 ${i > 0 ? 'border-t border-border' : ''}`}>
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">{r.label}</p>
                    <p className="text-xs font-mono break-all text-foreground">{r.value}</p>
                  </div>
                  <CopyButton value={r.value} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
