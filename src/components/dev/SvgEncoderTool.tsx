import { useImmer } from 'use-immer';
import { useClipboard } from '@mantine/hooks';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import DropZone from '@/components/shared/DropZone';
import { useToolVisit } from '@/stores/toolVisit';
import { encodeSvgToDataUri, looksLikeSvg, type SvgEncoding } from '@/lib/dev/svgEncoder';
import { CopyIcon, CheckIcon, ArrowCounterClockwiseIcon, WarningCircleIcon } from '@phosphor-icons/react';

const EXAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor">
  <circle cx="12" cy="12" r="9" />
</svg>`;

interface State {
  svg: string;
  encoding: SvgEncoding;
}

export default function SvgEncoderTool() {
  useToolVisit('dev', '/dev/svg-encoder');

  const [state, update] = useImmer<State>({ svg: EXAMPLE_SVG, encoding: 'url' });
  const clipboard = useClipboard({ timeout: 2000 });

  const dataUri = state.svg ? encodeSvgToDataUri(state.svg, state.encoding) : '';
  const showWarning = state.svg.trim().length > 0 && !looksLikeSvg(state.svg);

  async function handleFile(files: File[]) {
    const f = files[0];
    if (!f) return;
    const text = await f.text();
    update(d => { d.svg = text; });
  }

  function handleReset() {
    update(d => { d.svg = ''; });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-5 pb-4">
          <DropZone
            onFiles={handleFile}
            multiple={false}
            accept=".svg"
            label="Drop an .svg file"
            sublabel="Or paste SVG markup below"
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* SVG input */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">SVG markup</Label>
            <Button variant="ghost" size="sm" onClick={handleReset} className="gap-1.5 h-7 px-2 text-xs">
              <ArrowCounterClockwiseIcon className="size-3" /> Reset
            </Button>
          </div>
          <Textarea
            value={state.svg}
            onChange={e => update(d => { d.svg = e.target.value; })}
            spellCheck={false}
            className="h-64 font-mono resize-none"
            placeholder="Paste <svg>…</svg> markup here…"
          />
          {showWarning && (
            <p className="flex items-center gap-1.5 text-xs text-amber-500">
              <WarningCircleIcon className="size-3.5" /> This doesn't look like SVG markup — encoding it anyway.
            </p>
          )}
        </div>

        {/* Encoded output */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Data URI</Label>
            {dataUri && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => clipboard.copy(dataUri)}
                className="gap-1.5 h-7 px-2 text-xs"
              >
                {clipboard.copied
                  ? <><CheckIcon className="size-3 text-green-500" /> Copied</>
                  : <><CopyIcon className="size-3" /> Copy</>}
              </Button>
            )}
          </div>

          <Tabs
            value={state.encoding}
            onValueChange={v => update(d => { d.encoding = v as SvgEncoding; })}
          >
            <TabsList>
              <TabsTrigger value="url">URL-encoded</TabsTrigger>
              <TabsTrigger value="base64">Base64</TabsTrigger>
            </TabsList>
          </Tabs>

          <Textarea
            value={dataUri}
            readOnly
            spellCheck={false}
            className="h-48 font-mono resize-none"
            placeholder="Encoded data URI will appear here…"
          />

          {dataUri && (
            <div className="flex items-center justify-center rounded-lg border border-border bg-[repeating-conic-gradient(#80808022_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] p-6">
              <img src={dataUri} alt="SVG preview" className="max-h-32 max-w-full" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
