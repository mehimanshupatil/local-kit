import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { useState, useEffect } from 'react';
import { useImmer } from 'use-immer';
import DropZone from '@/components/shared/DropZone';
import ProgressBar from '@/components/shared/ProgressBar';
import OutputFiles, { type OutputFile } from '@/components/shared/OutputFiles';
import { compressImage } from '@/lib/image/imageCompress';
import { formatFileSize, generateId } from '@/lib/utils/fileUtils';
import { useToolPrefs } from '@/stores/prefsStore';
import { useToolVisit } from '@/stores/toolVisit';
import { type ToolOp, IDLE_OP } from '@/lib/utils/toolState';

interface FileEntry { id: string; file: File; preview: string }

export default function ImageCompressTool() {
  const [files, updateFiles] = useImmer<FileEntry[]>([]);
  const [prefs, updatePrefs] = useToolPrefs('/image/compress', { maxSizeMB: 1, quality: 80 });
  const { maxSizeMB, quality } = prefs;
  const setMaxSizeMB = (v: number) => updatePrefs({ maxSizeMB: v });
  const setQuality = (v: number) => updatePrefs({ quality: v });
  const [op, updateOp] = useImmer<ToolOp>({ ...IDLE_OP });
  const { status, progress, output, error } = op;
  const { sessionFiles, setSessionFiles, clearSession } = useToolVisit('image', '/image/compress');

  const addFiles = (incoming: File[]) => {
    const entries = incoming.filter(f => f.type.startsWith('image/')).map(f => ({
      id: generateId(), file: f, preview: URL.createObjectURL(f),
    }));
    updateFiles(draft => { draft.push(...entries); });
    updateOp(() => ({ ...IDLE_OP }));
  };

  // Seed from session on mount
  useEffect(() => {
    if (sessionFiles.length > 0 && files.length === 0) { addFiles(sessionFiles); }
  }, []);

  // Sync session whenever files change (guard skips initial empty render)
  useEffect(() => {
    if (files.length > 0) setSessionFiles(files.map(f => f.file));
  }, [files]);

  useEffect(() => {
    if (files.length > 0 && status === 'idle') compress();
  }, [files.length]);

  const remove = (id: string) => {
    const f = files.find(f => f.id === id);
    if (f) URL.revokeObjectURL(f.preview);
    updateFiles(draft => { const i = draft.findIndex(f => f.id === id); if (i !== -1) draft.splice(i, 1); });
  };

  const compress = async () => {
    if (files.length === 0) return;
    updateOp(d => { d.status = 'processing'; d.progress = 0; d.error = ''; });
    const results: OutputFile[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const result = await compressImage(files[i].file, { maxSizeMB, quality: quality / 100 },
          (pct) => updateOp(d => { d.progress = Math.round((i / files.length * 100) + pct / files.length); })
        );
        results.push({ name: result.name, blob: result.blob, size: result.newSize });
      }
      updateOp(d => { d.output = results; d.status = 'done'; });
    } catch (e) {
      updateOp(d => { d.error = e instanceof Error ? e.message : 'Compression failed'; d.status = 'error'; });
    }
  };

  return (
    <div className="space-y-5">
      <DropZone onFiles={addFiles} accept="image/*" label="Drop images here" sublabel="JPEG, PNG, WebP, GIF supported" />

      {files.length > 0 && (
        <Card className="p-5 space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {files.map(f => (
              <div key={f.id} className="relative group rounded-xl overflow-hidden border border-border">
                <img src={f.preview} alt={f.file.name} className="w-full h-24 object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Button onClick={() => remove(f.id)} className="bg-red-500 text-white rounded-full size-7 flex items-center justify-center text-lg leading-none">×</Button>
                </div>
                <div className="px-2 py-1 bg-card">
                  <p className="text-xs text-muted-foreground truncate">{formatFileSize(f.file.size)}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Max size (MB)</Label>
              <Input type="number" min={0.1} max={50} step={0.1} value={maxSizeMB} onChange={e => setMaxSizeMB(parseFloat(e.target.value))} className="w-24" />
            </div>
            <div>
              <Label>Quality: {quality}%</Label>
              <Slider min={10} max={100} step={1} value={quality} onValueChange={(v) => setQuality(Array.isArray(v) ? v[0] : v)} />
            </div>
          </div>

          {status === 'processing' && <ProgressBar progress={progress} label="Compressing images..." />}
          {status === 'error' && <p className="text-sm text-red-500 bg-red-500/10 px-4 py-3 rounded-xl">{error}</p>}

          <div className="flex gap-3">
            <Button onClick={compress} disabled={status === 'processing'} >
              {status === 'processing' ? 'Compressing...' : `Compress ${files.length} image${files.length > 1 ? 's' : ''}`}
            </Button>
            <Button variant="secondary" onClick={() => { files.forEach(f => URL.revokeObjectURL(f.preview)); updateFiles(() => []); updateOp(() => ({ ...IDLE_OP })); clearSession(); }} >Reset</Button>
          </div>
        </Card>
      )}

      {output.length > 0 && <OutputFiles files={output} />}
    </div>
  );
}
