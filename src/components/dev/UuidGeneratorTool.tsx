import { useState } from 'react';
import { useClipboard } from '@mantine/hooks';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToolVisit } from '@/stores/toolVisit';
import { generateUuids, type UuidVersion } from '@/lib/dev/uuidGenerator';
import { CopyIcon, CheckIcon, FingerprintIcon } from '@phosphor-icons/react';

const VERSIONS: UuidVersion[] = ['v4', 'v7'];

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

export default function UuidGeneratorTool() {
  useToolVisit('dev', '/dev/uuid-generator');

  const [version, setVersion] = useState<UuidVersion>('v4');
  const [count, setCount] = useState('5');
  const [uuids, setUuids] = useState<string[]>([]);
  const copyAllClipboard = useClipboard({ timeout: 2000 });

  function handleGenerate() {
    const n = Math.min(100, Math.max(1, Math.round(parseFloat(count)) || 1));
    setUuids(generateUuids(version, n));
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-5 pb-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_auto] gap-4 items-end">
            <div className="space-y-1.5">
              <Label>Version</Label>
              <div className="flex rounded-md border border-input overflow-hidden w-fit">
                {VERSIONS.map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setVersion(v)}
                    className={`px-4 py-1.5 text-sm uppercase transition-colors ${
                      version === v ? 'bg-brand-500 text-white' : 'bg-transparent text-muted-foreground hover:bg-secondary'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="count">Count (1–100)</Label>
              <Input
                id="count"
                type="number"
                min={1}
                max={100}
                inputMode="numeric"
                value={count}
                onChange={e => setCount(e.target.value)}
              />
            </div>
            <Button onClick={handleGenerate} className="gap-2">
              <FingerprintIcon className="size-4" />
              Generate
            </Button>
          </div>
        </CardContent>
      </Card>

      {uuids.length > 0 && (
        <Card>
          <CardContent className="pt-5 pb-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">{uuids.length} UUID{uuids.length > 1 ? 's' : ''}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyAllClipboard.copy(uuids.join('\n'))}
                className="gap-1.5"
              >
                {copyAllClipboard.copied
                  ? <><CheckIcon className="size-3.5 text-green-500" /> Copied</>
                  : <><CopyIcon className="size-3.5" /> Copy All</>}
              </Button>
            </div>
            <div className="rounded-xl border border-border overflow-hidden max-h-96 overflow-y-auto">
              {uuids.map((uuid, i) => (
                <div key={i} className={`flex items-center justify-between gap-2 p-2.5 ${i > 0 ? 'border-t border-border' : ''}`}>
                  <span className="text-xs font-mono break-all text-foreground">{uuid}</span>
                  <CopyButton value={uuid} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
