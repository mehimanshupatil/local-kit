import { useImmer } from 'use-immer';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import DropZone from '@/components/shared/DropZone';
import { useToolVisit } from '@/stores/toolVisit';
import { renderMarkdown } from '@/lib/dev/markdownRenderer';
import { GlobeIcon, WarningCircleIcon } from '@phosphor-icons/react';

const EXAMPLE_MD = `# Hello, LocalKit!

Paste your Markdown here and see it **rendered live**.

## Features

- Tables, code blocks, images
- \`inline code\` and fenced blocks
- [Links](https://localkit.dev) and *emphasis*

\`\`\`js
const greet = name => \`Hello, \${name}!\`;
console.log(greet('world'));
\`\`\`

> Quotes work too.

| Column A | Column B |
|----------|----------|
| Cell 1   | Cell 2   |
`;

interface State {
  pasteText: string;
  urlInput: string;
  urlError: string;
  urlLoading: boolean;
  urlText: string;
  fileText: string;
}

function PaneLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 py-1.5 border-b border-border text-[10px] font-mono text-muted-foreground uppercase tracking-wider shrink-0">
      {children}
    </div>
  );
}

function PreviewPane({ markdown }: { markdown: string }) {
  if (!markdown.trim()) {
    return <p className="text-sm text-muted-foreground p-4">Nothing to preview yet.</p>;
  }
  return (
    <div
      className="prose prose-sm dark:prose-invert max-w-none p-4"
      dangerouslySetInnerHTML={{ __html: renderMarkdown(markdown) }}
    />
  );
}

function SplitEditor({
  value,
  onChange,
  height = 520,
}: {
  value: string;
  onChange: (v: string) => void;
  height?: number;
}) {
  return (
    <ResizablePanelGroup
      orientation="horizontal"
      className="rounded border border-border"
      style={{ height }}
    >
      <ResizablePanel defaultSize={'50%'} minSize={20} >
        <div className="flex flex-col w-full h-full">
          <PaneLabel>Markdown</PaneLabel>
          <Textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            spellCheck={false}
            className="flex-1 w-full font-mono resize-none text-sm border-0 rounded-none focus-visible:ring-0 bg-transparent"
            placeholder="# Title&#10;&#10;Write your Markdown here…"
          />
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={'50%'} minSize={20} >
        <div className="flex flex-col w-full h-full">
          <PaneLabel>Preview</PaneLabel>
          <div className="flex-1 w-full overflow-y-auto">
            <PreviewPane markdown={value} />
          </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

export default function MarkdownPreviewTool() {
  useToolVisit('dev', '/dev/markdown-preview');

  const [state, update] = useImmer<State>({
    pasteText: EXAMPLE_MD,
    urlInput: '',
    urlError: '',
    urlLoading: false,
    urlText: '',
    fileText: '',
  });

  async function handleFetch() {
    if (!state.urlInput.trim()) return;
    update(d => { d.urlLoading = true; d.urlError = ''; d.urlText = ''; });
    try {
      const res = await fetch(state.urlInput.trim());
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const text = await res.text();
      update(d => { d.urlText = text; d.urlLoading = false; });
    } catch (e) {
      update(d => { d.urlError = e instanceof Error ? e.message : 'Failed to fetch'; d.urlLoading = false; });
    }
  }

  async function handleFile(files: File[]) {
    const f = files[0];
    if (!f) return;
    const text = await f.text();
    update(d => { d.fileText = text; });
  }

  return (
    <div className="space-y-4">
      <Tabs defaultValue="paste">
        <TabsList>
          <TabsTrigger value="paste">Paste</TabsTrigger>
          <TabsTrigger value="upload">Upload</TabsTrigger>
          <TabsTrigger value="url">Fetch URL</TabsTrigger>
        </TabsList>

        <TabsContent value="paste" className="mt-4">
          <SplitEditor value={state.pasteText} onChange={v => update(d => { d.pasteText = v; })} />
        </TabsContent>

        <TabsContent value="upload" className="space-y-4 mt-4">
          {!state.fileText ? (
            <Card>
              <CardContent className="pt-5 pb-4">
                <DropZone onFiles={handleFile} multiple={false} accept=".md,.markdown,.txt"
                  label="Drop a .md or .txt file" sublabel="Rendered below after upload" />
              </CardContent>
            </Card>
          ) : (
            <SplitEditor value={state.fileText} onChange={v => update(d => { d.fileText = v; })} />
          )}
        </TabsContent>

        <TabsContent value="url" className="space-y-4 mt-4">
          <Card>
            <CardContent className="pt-5 pb-4 space-y-3">
              <Label htmlFor="md-url">URL of a raw Markdown file</Label>
              <div className="flex gap-2">
                <Input
                  id="md-url"
                  value={state.urlInput}
                  onChange={e => update(d => { d.urlInput = e.target.value; d.urlError = ''; })}
                  onKeyDown={e => { if (e.key === 'Enter') handleFetch(); }}
                  placeholder="https://raw.githubusercontent.com/…/README.md"
                  className="font-mono text-sm flex-1"
                />
                <Button onClick={handleFetch} disabled={state.urlLoading || !state.urlInput.trim()}>
                  <GlobeIcon className="size-4" />
                  {state.urlLoading ? 'Fetching…' : 'Fetch'}
                </Button>
              </div>
              {state.urlError && (
                <p className="flex items-center gap-1.5 text-sm text-red-500">
                  <WarningCircleIcon className="size-4" /> {state.urlError}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Must be CORS-accessible (e.g. raw.githubusercontent.com, gist.github.com).
              </p>
            </CardContent>
          </Card>
          {state.urlText && (
            <SplitEditor value={state.urlText} onChange={v => update(d => { d.urlText = v; })} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
