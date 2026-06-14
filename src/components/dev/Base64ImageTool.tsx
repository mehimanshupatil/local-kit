 import { useClipboard } from '@mantine/hooks';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CopyIcon, CheckIcon, DownloadSimpleIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { useState, useEffect } from 'react';
import imageType from 'image-type';

type Parsed = { dataUrl: string; mimeType: string; ext: string };

async function parseInput(raw: string): Promise<Parsed | null> {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('data:')) {
    const match = trimmed.match(/^data:(image\/[a-zA-Z+.-]+);base64,/);
    if (!match) return null;
    const mime = match[1];
    const ext = mime.split('/')[1].replace('jpeg', 'jpg').replace('svg+xml', 'svg');
    return { dataUrl: trimmed, mimeType: mime, ext };
  }

  const clean = trimmed.replace(/\s/g, '');
  try {
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const type = await imageType(bytes);
    if (!type) return null;
    return { dataUrl: `data:${type.mime};base64,${clean}`, mimeType: type.mime, ext: type.ext };
  } catch {
    return null;
  }
}

function formatBytes(base64: string): string {
  const bytes = Math.ceil((base64.replace(/=+$/, '').length * 6) / 8);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function Base64ImageTool() {
  const [input, setInput] = useState('');
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const clipboard = useClipboard({ timeout: 2000 });

  useEffect(() => {
    if (!input.trim()) { setParsed(null); return; }
    parseInput(input).then(setParsed);
  }, [input]);

  const error = input.trim() && parsed === null && input.trim().length > 10
    ? 'Invalid base64 or unsupported image format'
    : '';
  const rawBase64 = parsed?.dataUrl.split(',')[1] ?? '';

  function download() {
    if (!parsed) return;
    const a = document.createElement('a');
    a.href = parsed.dataUrl;
    a.download = `image.${parsed.ext}`;
    a.click();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-5 pb-4 space-y-3">
          <Label htmlFor="b64-input">Base64 string or data URL</Label>
          <Textarea
            id="b64-input"
            rows={5}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Paste raw base64 or data:image/png;base64,… here"
            spellCheck={false}
            className="font-mono resize-none"
          />
          {error && (
            <p className="flex items-center gap-1.5 text-sm text-red-500">
              <WarningCircleIcon className="size-4 shrink-0" /> {error}
            </p>
          )}
        </CardContent>
      </Card>

      {parsed && (
        <Card>
          <CardContent className="pt-5 pb-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">Preview</p>
              <div className="flex gap-3 text-xs text-muted-foreground">
                <span className="font-mono uppercase">{parsed.mimeType}</span>
                <span>{formatBytes(rawBase64)}</span>
              </div>
            </div>

            <div className="flex items-center justify-center rounded-xl border border-border bg-card/60 min-h-64 p-4">
              <img
                src={parsed.dataUrl}
                alt="Decoded"
                className="max-w-full max-h-96 rounded object-contain"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={download} className="gap-2">
                <DownloadSimpleIcon className="size-4" /> Download
              </Button>
              <Button variant="ghost" onClick={() => clipboard.copy(parsed.dataUrl)} className="gap-2">
                {clipboard.copied
                  ? <><CheckIcon className="size-4 text-green-500" /> Copied</>
                  : <><CopyIcon className="size-4" /> Copy data URL</>
                }
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
