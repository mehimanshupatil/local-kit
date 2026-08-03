import { useImmer } from 'use-immer';
import { useClipboard } from '@mantine/hooks';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToolVisit } from '@/stores/toolVisit';
import { yamlToJson, jsonToYaml } from '@/lib/dev/yamlJsonConverter';
import { CopyIcon, CheckIcon, ArrowCounterClockwiseIcon } from '@phosphor-icons/react';

interface State {
  yaml: string;
  json: string;
  yamlError: string;
  jsonError: string;
}

export default function YamlJsonConverterTool() {
  useToolVisit('dev', '/dev/yaml-json-converter');

  const [state, update] = useImmer<State>({ yaml: '', json: '', yamlError: '', jsonError: '' });
  const yamlClipboard = useClipboard({ timeout: 2000 });
  const jsonClipboard = useClipboard({ timeout: 2000 });

  function handleYamlChange(value: string) {
    update(d => {
      d.yaml = value;
      d.jsonError = '';
      if (!value.trim()) {
        d.json = '';
        d.yamlError = '';
        return;
      }
      try {
        d.json = yamlToJson(value);
        d.yamlError = '';
      } catch (err) {
        d.yamlError = err instanceof Error ? err.message : 'Invalid YAML';
      }
    });
  }

  function handleJsonChange(value: string) {
    update(d => {
      d.json = value;
      d.yamlError = '';
      if (!value.trim()) {
        d.yaml = '';
        d.jsonError = '';
        return;
      }
      try {
        d.yaml = jsonToYaml(value);
        d.jsonError = '';
      } catch (err) {
        d.jsonError = err instanceof Error ? err.message : 'Invalid JSON';
      }
    });
  }

  function handleReset() {
    update(d => { d.yaml = ''; d.json = ''; d.yamlError = ''; d.jsonError = ''; });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={handleReset} className="gap-1.5">
          <ArrowCounterClockwiseIcon className="size-4" /> Reset
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">YAML</Label>
            {state.yaml && (
              <Button variant="ghost" size="sm" onClick={() => yamlClipboard.copy(state.yaml)} className="gap-1.5 h-7 px-2 text-xs">
                {yamlClipboard.copied
                  ? <><CheckIcon className="size-3 text-green-500" /> Copied</>
                  : <><CopyIcon className="size-3" /> Copy</>}
              </Button>
            )}
          </div>
          <Textarea
            value={state.yaml}
            onChange={e => handleYamlChange(e.target.value)}
            spellCheck={false}
            className="h-64 font-mono text-xs resize-none"
            placeholder="Paste YAML here…"
          />
          {state.yamlError && <p className="text-xs text-red-500">{state.yamlError}</p>}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">JSON</Label>
            {state.json && (
              <Button variant="ghost" size="sm" onClick={() => jsonClipboard.copy(state.json)} className="gap-1.5 h-7 px-2 text-xs">
                {jsonClipboard.copied
                  ? <><CheckIcon className="size-3 text-green-500" /> Copied</>
                  : <><CopyIcon className="size-3" /> Copy</>}
              </Button>
            )}
          </div>
          <Textarea
            value={state.json}
            onChange={e => handleJsonChange(e.target.value)}
            spellCheck={false}
            className="h-64 font-mono text-xs resize-none"
            placeholder="Or paste JSON here…"
          />
          {state.jsonError && <p className="text-xs text-red-500">{state.jsonError}</p>}
        </div>
      </div>
    </div>
  );
}
