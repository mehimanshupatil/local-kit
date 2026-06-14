import { useImmer } from 'use-immer';
import { useClipboard } from '@mantine/hooks';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToolVisit } from '@/stores/toolVisit';
import {
  CopyIcon,
  CheckIcon,
  BracketsCurlyIcon,
  MinusCircleIcon,
  CheckCircleIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';

interface State {
  input: string;
  output: string;
  error: string;
  status: 'idle' | 'valid' | 'error';
}

export default function JSONFormatterTool() {
  useToolVisit('dev', '/dev/json-formatter');

  const [state, update] = useImmer<State>({
    input: '',
    output: '',
    error: '',
    status: 'idle',
  });
  const clipboard = useClipboard({ timeout: 2000 });

  function handleFormat() {
    if (!state.input.trim()) return;
    try {
      const parsed = JSON.parse(state.input);
      const formatted = JSON.stringify(parsed, null, 2);
      update(d => { d.output = formatted; d.error = ''; d.status = 'valid'; });
    } catch (e) {
      update(d => { d.output = ''; d.error = e instanceof Error ? e.message : 'Invalid JSON'; d.status = 'error'; });
    }
  }

  function handleMinify() {
    if (!state.input.trim()) return;
    try {
      const parsed = JSON.parse(state.input);
      const minified = JSON.stringify(parsed);
      update(d => { d.output = minified; d.error = ''; d.status = 'valid'; });
    } catch (e) {
      update(d => { d.output = ''; d.error = e instanceof Error ? e.message : 'Invalid JSON'; d.status = 'error'; });
    }
  }

  function handleValidate() {
    if (!state.input.trim()) return;
    try {
      JSON.parse(state.input);
      update(d => { d.error = ''; d.status = 'valid'; });
    } catch (e) {
      update(d => { d.output = ''; d.error = e instanceof Error ? e.message : 'Invalid JSON'; d.status = 'error'; });
    }
  }

  return (
    <div className="space-y-6">
      {/* Actions */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex flex-wrap gap-2 items-center">
            <Button onClick={handleFormat} className="gap-2">
              <BracketsCurlyIcon className="size-4" /> Format
            </Button>
            <Button variant="secondary" onClick={handleMinify} className="gap-2">
              <MinusCircleIcon className="size-4" /> Minify
            </Button>
            <Button variant="outline" onClick={handleValidate} className="gap-2">
              <CheckCircleIcon className="size-4" /> Validate
            </Button>
            {state.status === 'valid' && !state.error && (
              <span className="flex items-center gap-1.5 text-sm text-green-500 ml-auto">
                <CheckCircleIcon className="size-4" /> Valid JSON
              </span>
            )}
            {state.status === 'error' && (
              <span className="flex items-center gap-1.5 text-sm text-red-500 ml-auto">
                <WarningCircleIcon className="size-4" /> {state.error}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Input */}
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Input</Label>
          <Textarea
            value={state.input}
            onChange={e => update(d => { d.input = e.target.value; d.status = 'idle'; d.error = ''; })}
            spellCheck={false}
            className="h-96 font-mono resize-none"
            placeholder={'{\n  "key": "value",\n  "array": [1, 2, 3]\n}'}
          />
        </div>

        {/* Output */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Output</Label>
            {state.output && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => clipboard.copy(state.output)}
                className="gap-1.5 h-7 px-2 text-xs"
              >
                {clipboard.copied
                  ? <><CheckIcon className="size-3 text-green-500" /> Copied</>
                  : <><CopyIcon className="size-3" /> Copy</>}
              </Button>
            )}
          </div>
          <Textarea
            readOnly
            value={state.output}
            spellCheck={false}
            className="h-96 font-mono resize-none bg-card/60"
            placeholder="Formatted or minified JSON will appear here…"
          />
        </div>
      </div>
    </div>
  );
}
