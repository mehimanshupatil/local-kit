import { useImmer } from 'use-immer';
import { useClipboard } from '@mantine/hooks';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToolVisit } from '@/stores/toolVisit';
import { CopyIcon, CheckIcon, ArrowCounterClockwiseIcon } from '@phosphor-icons/react';

interface State {
  raw: string;
  encoded: string;
  rawError: string;
}

export default function URLEncoderTool() {
  useToolVisit('dev', '/dev/url-encoder');

  const [state, update] = useImmer<State>({ raw: '', encoded: '', rawError: '' });
  const rawClipboard = useClipboard({ timeout: 2000 });
  const encodedClipboard = useClipboard({ timeout: 2000 });

  function handleRawChange(value: string) {
    update(d => {
      d.raw = value;
      d.rawError = '';
      try {
        d.encoded = value ? encodeURIComponent(value) : '';
      } catch {
        d.encoded = '';
      }
    });
  }

  function handleEncodedChange(value: string) {
    update(d => {
      d.encoded = value;
      d.rawError = '';
      if (!value) {
        d.raw = '';
        return;
      }
      try {
        d.raw = decodeURIComponent(value);
        d.rawError = '';
      } catch {
        d.rawError = 'Invalid percent-encoded sequence';
        d.raw = '';
      }
    });
  }

  function handleReset() {
    update(d => { d.raw = ''; d.encoded = ''; d.rawError = ''; });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={handleReset} className="gap-1.5">
              <ArrowCounterClockwiseIcon className="size-4" /> Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Raw */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Raw / Decoded</Label>
            {state.raw && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => rawClipboard.copy(state.raw)}
                className="gap-1.5 h-7 px-2 text-xs"
              >
                {rawClipboard.copied
                  ? <><CheckIcon className="size-3 text-green-500" /> Copied</>
                  : <><CopyIcon className="size-3" /> Copy</>}
              </Button>
            )}
          </div>
          <Textarea
            value={state.raw}
            onChange={e => handleRawChange(e.target.value)}
            spellCheck={false}
            className="h-48 font-mono resize-none"
            placeholder="Type or paste a URL/text here to encode…"
          />
          <p className="text-xs text-muted-foreground">Type here → updates the encoded box</p>
        </div>

        {/* Encoded */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Encoded</Label>
            {state.encoded && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => encodedClipboard.copy(state.encoded)}
                className="gap-1.5 h-7 px-2 text-xs"
              >
                {encodedClipboard.copied
                  ? <><CheckIcon className="size-3 text-green-500" /> Copied</>
                  : <><CopyIcon className="size-3" /> Copy</>}
              </Button>
            )}
          </div>
          <Textarea
            value={state.encoded}
            onChange={e => handleEncodedChange(e.target.value)}
            spellCheck={false}
            className="h-48 font-mono resize-none"
            placeholder="Or paste an encoded URL here to decode…"
          />
          {state.rawError ? (
            <p className="text-xs text-red-500">{state.rawError}</p>
          ) : (
            <p className="text-xs text-muted-foreground">Type here → updates the raw box</p>
          )}
        </div>
      </div>
    </div>
  );
}
