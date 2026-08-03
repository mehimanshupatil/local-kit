import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToolVisit } from '@/stores/toolVisit';
import { computeLineDiff, computeStats } from '@/lib/dev/textDiff';

export default function TextDiffTool() {
  useToolVisit('dev', '/dev/text-diff');

  const [oldText, setOldText] = useState('');
  const [newText, setNewText] = useState('');

  const lines = useMemo(() => computeLineDiff(oldText, newText), [oldText, newText]);
  const stats = useMemo(() => computeStats(lines), [lines]);
  const hasInput = oldText.length > 0 || newText.length > 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="old-text">Original</Label>
          <Textarea
            id="old-text"
            value={oldText}
            onChange={e => setOldText(e.target.value)}
            spellCheck={false}
            className="h-64 font-mono text-xs resize-none"
            placeholder="Paste the original text…"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-text">Changed</Label>
          <Textarea
            id="new-text"
            value={newText}
            onChange={e => setNewText(e.target.value)}
            spellCheck={false}
            className="h-64 font-mono text-xs resize-none"
            placeholder="Paste the changed text…"
          />
        </div>
      </div>

      {hasInput && (
        <Card>
          <CardContent className="pt-5 pb-4 space-y-3">
            <div className="flex items-center gap-4 text-xs font-semibold">
              <span className="text-green-500">+{stats.additions} added</span>
              <span className="text-red-500">-{stats.deletions} removed</span>
            </div>
            <div className="rounded-md border border-border overflow-x-auto">
              <pre className="text-xs font-mono leading-relaxed">
                {lines.map((line, i) => (
                  <div
                    key={i}
                    className={
                      line.type === 'added'
                        ? 'bg-green-500/10 text-green-600 dark:text-green-400 px-2'
                        : line.type === 'removed'
                        ? 'bg-red-500/10 text-red-600 dark:text-red-400 px-2'
                        : 'px-2 text-foreground'
                    }
                  >
                    <span className="select-none inline-block w-4 text-muted-foreground">
                      {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                    </span>
                    {line.content || ' '}
                  </div>
                ))}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
