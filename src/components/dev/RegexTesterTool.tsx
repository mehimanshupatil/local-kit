'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useToolVisit } from '@/stores/toolVisit';
import { testRegex, type RegexMatch } from '@/lib/dev/regexTester';

const FLAGS: { key: string; label: string; title: string }[] = [
  { key: 'g', label: 'g', title: 'Global — find all matches' },
  { key: 'i', label: 'i', title: 'Ignore case' },
  { key: 'm', label: 'm', title: 'Multiline — ^ and $ match line boundaries' },
  { key: 's', label: 's', title: 'Dot matches newline' },
];

interface Segment {
  text: string;
  isMatch: boolean;
  matchIndex: number;
}

function buildSegments(input: string, matches: RegexMatch[]): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;
  matches.forEach((m, i) => {
    if (m.index > cursor) segments.push({ text: input.slice(cursor, m.index), isMatch: false, matchIndex: -1 });
    segments.push({ text: m.match, isMatch: true, matchIndex: i });
    cursor = m.index + m.match.length;
  });
  if (cursor < input.length) segments.push({ text: input.slice(cursor), isMatch: false, matchIndex: -1 });
  return segments;
}

export default function RegexTesterTool() {
  useToolVisit('dev', '/dev/regex-tester');

  const [pattern, setPattern] = useState('\\b\\w+@\\w+\\.\\w+\\b');
  const [activeFlags, setActiveFlags] = useState<Set<string>>(new Set(['g', 'i']));
  const [testString, setTestString] = useState('Contact us at hello@example.com or support@example.org.');

  const flagsString = useMemo(() => FLAGS.filter(f => activeFlags.has(f.key)).map(f => f.key).join(''), [activeFlags]);
  const result = useMemo(() => testRegex(pattern, flagsString, testString), [pattern, flagsString, testString]);
  const segments = useMemo(() => buildSegments(testString, result.matches), [testString, result.matches]);

  function toggleFlag(key: string) {
    setActiveFlags(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-5 pb-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-muted-foreground text-lg">/</span>
            <input
              className="flex-1 h-9 rounded-md border border-input bg-transparent px-2.5 text-sm font-mono shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="pattern"
              value={pattern}
              onChange={e => setPattern(e.target.value)}
            />
            <span className="font-mono text-muted-foreground text-lg">/</span>
            <div className="flex rounded-md border border-input overflow-hidden shrink-0">
              {FLAGS.map(f => (
                <button
                  key={f.key}
                  type="button"
                  title={f.title}
                  onClick={() => toggleFlag(f.key)}
                  className={`w-8 h-9 text-sm font-mono transition-colors ${
                    activeFlags.has(f.key)
                      ? 'bg-brand-500 text-white'
                      : 'bg-transparent text-muted-foreground hover:bg-secondary'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          {result.error && (
            <p className="text-xs text-destructive">{result.error}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 pb-4 space-y-3">
          <p className="text-sm font-semibold">Test String</p>
          <Textarea
            value={testString}
            onChange={e => setTestString(e.target.value)}
            rows={5}
            className="font-mono text-sm"
            placeholder="Paste text to test against your pattern…"
          />
          <div className="rounded-md border border-border bg-secondary/50 px-3 py-2.5 text-sm font-mono whitespace-pre-wrap break-words">
            {segments.length === 0 && <span className="text-muted-foreground">Matches will be highlighted here</span>}
            {segments.map((seg, i) =>
              seg.isMatch
                ? <mark key={i} className="bg-brand-500/30 text-foreground rounded-xs">{seg.text}</mark>
                : <span key={i}>{seg.text}</span>
            )}
          </div>
        </CardContent>
      </Card>

      {!result.error && (
        <Card>
          <CardContent className="pt-5 pb-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-brand-500/15 text-brand-500 text-xs font-medium px-2.5 py-0.5">
                {result.matches.length} match{result.matches.length !== 1 ? 'es' : ''} found
              </span>
              {!activeFlags.has('g') && result.matches.length > 0 && (
                <span className="text-xs text-muted-foreground">Only the first match is shown — enable the g flag to find all</span>
              )}
            </div>

            {result.matches.length > 0 && (
              <div className="space-y-2">
                {result.matches.map((m, i) => (
                  <div key={i} className="rounded-md border border-border px-3 py-2 text-xs space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-muted-foreground font-medium">Match {i + 1}</span>
                      <span className="text-muted-foreground">@ index {m.index}</span>
                      <span className="font-mono bg-secondary px-1.5 py-0.5 rounded-xs">{m.match || '(empty match)'}</span>
                    </div>
                    {m.groups.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {m.groups.map((g, gi) => (
                          <span key={gi} className="font-mono text-muted-foreground">
                            ${gi + 1}: <span className="text-foreground">{g ?? '—'}</span>
                          </span>
                        ))}
                      </div>
                    )}
                    {m.namedGroups && Object.keys(m.namedGroups).length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(m.namedGroups).map(([name, val]) => (
                          <span key={name} className="font-mono text-muted-foreground">
                            {name}: <span className="text-foreground">{val ?? '—'}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
