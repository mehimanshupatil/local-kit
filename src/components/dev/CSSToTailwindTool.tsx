import { useImmer } from 'use-immer';
import { useTimeout } from '@mantine/hooks';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CopyIcon, CheckIcon, MagicWandIcon, ArrowCounterClockwiseIcon } from '@phosphor-icons/react';
import { convertCSS, type ConvertResult } from '@/lib/dev/cssToTailwind';

// ─── Component ───────────────────────────────────────────────────────────────

const EXAMPLE_CSS = `.label {
  color: var(--Cool-grey-30, #E0E4EC);
  /* New/Paragraph/P1 Regular */
  font-family: "Open Sans";
  font-size: 0.75rem;
  font-style: normal;
  font-weight: 700;
  line-height: 1.25rem; /* 166.667% */
  letter-spacing: 0.01563rem;
}

.card {
  display: flex;
  flex-direction: column;
  padding: 24px;
  background-color: var(--Surface-default, #ffffff);
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  gap: 12px;
  max-width: 448px;
}

.card:hover {
  border-color: #10b981;
}

@media only screen and (max-width: 768px) {
  .card {
    max-width: 100vw;
    padding: 16px;
  }
}`;

interface State {
  input: string;
  prefix: string;
  results: ConvertResult[];
  copied: boolean;
  converted: boolean;
}

export default function CSSToTailwindTool() {
  const [state, update] = useImmer<State>({
    input: EXAMPLE_CSS,
    prefix: '',
    results: [],
    copied: false,
    converted: false,
  });
  const { start: startCopyReset } = useTimeout(() => update(d => { d.copied = false; }), 2000);

  function handleConvert() {
    const results = convertCSS(state.input, state.prefix.trim());
    update(d => { d.results = results; d.converted = true; });
  }

  function handleReset() {
    update(d => { d.input = EXAMPLE_CSS; d.prefix = ''; d.results = []; d.converted = false; });
  }

  const hasUnrecognized = state.results.some(r => r.unrecognized.length > 0);
  const multipleSelectors = state.results.length > 1;
  const hasTokens = state.results.some(r => r.entries.some(e => e.kind !== 'tailwind'));

  function formatOutput(): string {
    if (!state.results.length) return '';
    if (!multipleSelectors) {
      const { entries, unrecognized } = state.results[0];
      const lines: string[] = [];
      if (entries.length) lines.push(entries.map(e => e.cls).join(' '));
      if (unrecognized.length) {
        lines.push('');
        lines.push('/* Unrecognized properties — convert manually: */');
        unrecognized.forEach(u => lines.push(`/* ${u}; */`));
      }
      return lines.join('\n');
    }
    return state.results
      .map(r => {
        const lines: string[] = [];
        if (r.selector) lines.push(`/* ${r.selector} */`);
        if (r.entries.length) lines.push(r.entries.map(e => e.cls).join(' '));
        if (r.unrecognized.length) {
          lines.push('/* Unrecognized:');
          r.unrecognized.forEach(u => lines.push(`   ${u};`));
          lines.push('*/');
        }
        return lines.join('\n');
      })
      .join('\n\n');
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(formatOutput());
    update(d => { d.copied = true; });
    startCopyReset();
  }

  const outputText = formatOutput();

  return (
    <div className="space-y-6">
      {/* Options bar */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="prefix">Class prefix <span className="text-xs text-muted-foreground font-normal">(e.g. <code>tw-</code> for Tailwind's <code>prefix</code> config)</span></Label>
              <Input
                id="prefix"
                value={state.prefix}
                onChange={e => update(d => { d.prefix = e.target.value; })}
                placeholder="Leave blank for no prefix"
                className="font-mono"
              />
            </div>
            <div className="flex gap-2 pb-0.5">
              <Button onClick={handleConvert} className="gap-2">
                <MagicWandIcon className="size-4" /> Convert
              </Button>
              <Button variant="secondary" onClick={handleReset} className="gap-2">
                <ArrowCounterClockwiseIcon className="size-4" /> Reset
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Editor area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Input */}
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">CSS Input</Label>
          <Textarea
            value={state.input}
            onChange={e => update(d => { d.input = e.target.value; d.converted = false; })}
            spellCheck={false}
            className="h-96 font-mono resize-none"
            placeholder="Paste your CSS here…&#10;&#10;.button {&#10;  padding: 12px 24px;&#10;  background-color: #3b82f6;&#10;}"
          />
        </div>

        {/* Output */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Tailwind Classes</Label>
            {state.converted && outputText && (
              <Button variant="ghost" size="sm" onClick={handleCopy} className="gap-1.5 h-7 px-2 text-xs">
                {state.copied ? <><CheckIcon className="size-3 text-green-500" /> Copied</> : <><CopyIcon className="size-3" /> Copy</>}
              </Button>
            )}
          </div>
          <div className="relative w-full h-96 rounded-xl border border-border bg-card/60 overflow-auto">
            {!state.converted ? (
              <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground select-none">
                Click Convert to see results
              </p>
            ) : !outputText ? (
              <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground select-none">
                No output — check your CSS input
              </p>
            ) : (
              <div className="p-4 space-y-4">
                {state.results.map((result, i) => (
                  <div key={i} className="space-y-1.5">
                    {multipleSelectors && result.selector && (
                      <p className="text-xs text-brand-500 font-mono font-semibold">{result.selector}</p>
                    )}
                    {result.entries.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {result.entries.map((entry, j) => {
                          const badgeClass =
                            entry.kind === 'var-token'
                              ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                              : entry.kind === 'typography-token'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : 'bg-brand-500/10 text-brand-400 border-brand-500/30';
                          return (
                            <span key={j} className={`inline-block border rounded px-1.5 py-0.5 text-xs font-mono ${badgeClass}`}>
                              {entry.cls}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {result.unrecognized.length > 0 && (
                      <div className="mt-1 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30">
                        <p className="text-xs font-semibold text-amber-500 mb-1">No Tailwind equivalent found:</p>
                        {result.unrecognized.map((u, j) => (
                          <p key={j} className="text-xs font-mono text-amber-500">/* {u}; */</p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats bar */}
      {state.converted && state.results.length > 0 && (
        <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2 rounded-full bg-brand-400"></span>
            {state.results.reduce((s, r) => s + r.entries.filter(e => e.kind === 'tailwind').length, 0)} Tailwind classes
          </span>
          {hasTokens && (
            <>
              {state.results.reduce((s, r) => s + r.entries.filter(e => e.kind === 'var-token').length, 0) > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block size-2 rounded-full bg-purple-400"></span>
                  {state.results.reduce((s, r) => s + r.entries.filter(e => e.kind === 'var-token').length, 0)} color tokens
                </span>
              )}
              {state.results.reduce((s, r) => s + r.entries.filter(e => e.kind === 'typography-token').length, 0) > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block size-2 rounded-full bg-emerald-400"></span>
                  {state.results.reduce((s, r) => s + r.entries.filter(e => e.kind === 'typography-token').length, 0)} typography tokens
                </span>
              )}
            </>
          )}
          {hasUnrecognized && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2 rounded-full bg-amber-400"></span>
              {state.results.reduce((s, r) => s + r.unrecognized.length, 0)} need manual conversion
            </span>
          )}
          {multipleSelectors && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2 rounded-full bg-[--muted-foreground]"></span>
              {state.results.length} selectors
            </span>
          )}
        </div>
      )}
    </div>
  );
}
