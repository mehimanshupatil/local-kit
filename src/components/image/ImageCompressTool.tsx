import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { useState } from 'react';
import { useImmer } from 'use-immer';
import DropZone from '@/components/shared/DropZone';
import ProgressBar from '@/components/shared/ProgressBar';
import OutputFiles, { type OutputFile } from '@/components/shared/OutputFiles';
import { compressImage } from '@/lib/image/imageCompress';
import { formatFileSize, generateId } from '@/lib/utils/fileUtils';

interface FileEntry { id: string; file: File; preview: string }

export default function ImageCompressTool() {
  const [files, updateFiles] = useImmer<FileEntry[]>([]);
  const [maxSizeMB, setMaxSizeMB] = useState(1);
  const [quality, setQuality] = useState(80);
  const [status, setStatus] = useState<'idle' | 'processing' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [output, setOutput] = useState<OutputFile[]>([]);
  const [error, setError] = useState('');

  const addFiles = (incoming: File[]) => {
    const entries = incoming.filter(f => f.type.startsWith('image/')).map(f => ({
      id: generateId(), file: f, preview: URL.createObjectURL(f),
    }));
    updateFiles(draft => { draft.push(...entries); });
    setStatus('idle'); setOutput([]);
  };

  const remove = (id: string) => {
    const f = files.find(f => f.id === id);
    if (f) URL.revokeObjectURL(f.preview);
    updateFiles(draft => { const i = draft.findIndex(f => f.id === id); if (i !== -1) draft.splice(i, 1); });
  };

  const compress = async () => {
    if (files.length === 0) return;
    setStatus('processing'); setProgress(0); setError('');
    const results: OutputFile[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const result = await compressImage(files[i].file, { maxSizeMB, quality: quality / 100 },
          (pct) => setProgress(Math.round((i / files.length * 100) + pct / files.length))
        );
        results.push({ name: result.name, blob: result.blob, size: result.newSize });
      }
      setOutput(results); setStatus('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Compression failed'); setStatus('error');
    }
  };

  return (
    <div className="space-y-5">
      <DropZone onFiles={addFiles} accept="image/*" label="Drop images here" sublabel="JPEG, PNG, WebP, GIF supported" />

      {files.length > 0 && (
        <div className="card p-5 space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {files.map(f => (
              <div key={f.id} className="relative group rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
                <img src={f.preview} alt={f.file.name} className="w-full h-24 object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Button onClick={() => remove(f.id)} className="bg-red-500 text-white rounded-full w-7 h-7 flex items-center justify-center text-lg leading-none">×</Button>
                </div>
                <div className="px-2 py-1 bg-white dark:bg-gray-900">
                  <p className="text-xs text-gray-500 truncate">{formatFileSize(f.file.size)}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Max size (MB)</Label>
              <input type="number" min={0.1} max={50} step={0.1} value={maxSizeMB} onChange={e => setMaxSizeMB(parseFloat(e.target.value))}  />
            </div>
            <div>
              <Label>Quality: {quality}%</Label>
              <Slider min={10} max={100} step={1} value={[quality]} onValueChange={([v]) => setQuality(v)} />
            </div>
          </div>

          {status === 'processing' && <ProgressBar progress={progress} label="Compressing images..." />}
          {status === 'error' && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-4 py-3 rounded-xl">{error}</p>}

          <div className="flex gap-3">
            <Button onClick={compress} disabled={status === 'processing'} >
              {status === 'processing' ? 'Compressing...' : `Compress ${files.length} image${files.length > 1 ? 's' : ''}`}
            </Button>
            <Button variant="secondary" onClick={() => { files.forEach(f => URL.revokeObjectURL(f.preview)); updateFiles(() => []); setOutput([]); }} >Reset</Button>
          </div>
        </div>
      )}

      {output.length > 0 && <OutputFiles files={output} />}
    </div>
  );
}
