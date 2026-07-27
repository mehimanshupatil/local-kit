'use client';

import { useEffect, useState } from 'react';
import { useImmer } from 'use-immer';
import { useClipboard } from '@mantine/hooks';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import DropZone from '@/components/shared/DropZone';
import ProgressBar from '@/components/shared/ProgressBar';
import OutputFiles from '@/components/shared/OutputFiles';
import { loadImage, cropToSquareCanvas, generateFavicons, buildHtmlSnippet } from '@/lib/dev/faviconGenerator';
import { formatFileSize } from '@/lib/utils/fileUtils';
import { useToolVisit } from '@/stores/toolVisit';
import { type ToolOp, IDLE_OP } from '@/lib/utils/toolState';
import { CheckIcon, CopyIcon } from '@phosphor-icons/react';

export default function FaviconGeneratorTool() {
  const { sessionFiles, setSessionFiles, clearSession } = useToolVisit('dev', '/dev/favicon-generator');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [op, updateOp] = useImmer<ToolOp>({ ...IDLE_OP });
  const { status, progress, output, error } = op;
  const clipboard = useClipboard({ timeout: 1500 });

  const handleFiles = (incoming: File[]) => {
    const f = incoming[0];
    if (!f) return;
    setFile(f);
    setSessionFiles([f]);
    updateOp(() => ({ ...IDLE_OP }));
  };

  useEffect(() => {
    if (sessionFiles.length > 0 && !file) { handleFiles([sessionFiles[0]]); }
  }, []);

  useEffect(() => {
    if (!file) { setPreviewUrl(''); return; }
    let cancelled = false;
    let url = '';
    loadImage(file).then(img => {
      if (cancelled) return;
      const square = cropToSquareCanvas(img);
      const preview = document.createElement('canvas');
      preview.width = 128;
      preview.height = 128;
      preview.getContext('2d')!.drawImage(square, 0, 0, 128, 128);
      preview.toBlob(b => {
        if (!b || cancelled) return;
        url = URL.createObjectURL(b);
        setPreviewUrl(url);
      }, 'image/png');
    }).catch(() => {});
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [file]);

  const handleGenerate = async () => {
    if (!file) return;
    updateOp(d => { d.status = 'processing'; d.progress = 0; d.error = ''; });
    try {
      const files = await generateFavicons(file, pct => updateOp(d => { d.progress = pct; }));
      updateOp(d => { d.output = files.map(f => ({ name: f.name, blob: f.blob, size: f.blob.size })); d.status = 'done'; });
    } catch (e) {
      updateOp(d => { d.error = e instanceof Error ? e.message : 'Failed to generate favicons'; d.status = 'error'; });
    }
  };

  const reset = () => {
    setFile(null);
    updateOp(() => ({ ...IDLE_OP }));
    clearSession();
  };

  return (
    <div className="space-y-5">
      <DropZone
        onFiles={handleFiles}
        accept="image/png,image/jpeg,image/jpg,image/webp"
        multiple={false}
        label="Drop a source image here"
        sublabel="PNG, JPEG or WebP — ideally square and at least 512×512"
      />

      {file && (
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-4">
            {previewUrl && (
              <img src={previewUrl} alt="Cropped preview" className="size-16 rounded-md border border-border shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground text-sm truncate">{file.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{formatFileSize(file.size)}</p>
              <p className="text-xs text-muted-foreground mt-1">Non-square images are automatically center-cropped</p>
            </div>
            <Button variant="secondary" onClick={reset} className="text-xs shrink-0">Clear</Button>
          </div>

          {status === 'processing' && <ProgressBar progress={progress} label="Generating favicons…" />}
          {status === 'error' && (
            <p className="text-sm text-red-500 bg-red-500/10 px-4 py-3 rounded-xl">{error}</p>
          )}

          <div className="flex gap-3">
            <Button onClick={handleGenerate} disabled={status === 'processing'}>
              {status === 'processing' ? 'Generating…' : 'Generate Favicons'}
            </Button>
            <Button variant="secondary" onClick={reset}>Reset</Button>
          </div>
        </Card>
      )}

      {output.length > 0 && (
        <Card>
          <CardContent className="pt-5 pb-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">HTML Snippet</p>
              <Button size="sm" variant="secondary" onClick={() => clipboard.copy(buildHtmlSnippet())}>
                {clipboard.copied ? <CheckIcon className="size-3.5 text-brand-500" /> : <CopyIcon className="size-3.5" />}
                {clipboard.copied ? 'Copied!' : 'Copy'}
              </Button>
            </div>
            <pre className="rounded-md border border-border bg-secondary/50 px-3 py-2.5 text-xs font-mono overflow-x-auto whitespace-pre">
              {buildHtmlSnippet()}
            </pre>
          </CardContent>
        </Card>
      )}

      {output.length > 0 && <OutputFiles files={output} />}
    </div>
  );
}
