import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { useState } from 'react';
import { useImmer } from 'use-immer';
import DropZone from '@/components/shared/DropZone';
import ProgressBar from '@/components/shared/ProgressBar';
import OutputFiles, { type OutputFile } from '@/components/shared/OutputFiles';
import { convertImage } from '@/lib/image/imageConvert';
import { formatFileSize, generateId } from '@/lib/utils/fileUtils';

interface FileEntry { id: string; file: File; preview: string }

const FORMATS = [
  { label: 'JPEG', mime: 'image/jpeg' },
  { label: 'PNG', mime: 'image/png' },
  { label: 'WebP', mime: 'image/webp' },
  { label: 'AVIF', mime: 'image/avif' },
];

export default function ImageConvertTool() {
  const [files, updateFiles] = useImmer<FileEntry[]>([]);
  const [targetMime, setTargetMime] = useState('image/webp');
  const [quality, setQuality] = useState(90);
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

  const convert = async () => {
    if (files.length === 0) return;
    setStatus('processing'); setProgress(0); setError('');
    const results: OutputFile[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const result = await convertImage(files[i].file, targetMime, quality / 100);
        results.push({ name: result.name, blob: result.blob, size: result.blob.size });
        setProgress(Math.round(((i + 1) / files.length) * 100));
      }
      setOutput(results); setStatus('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Conversion failed'); setStatus('error');
    }
  };

  return (
    <div className="space-y-5">
      <DropZone onFiles={addFiles} accept="image/*" label="Drop images to convert" />

      {files.length > 0 && (
        <div className="card p-5 space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {files.map(f => (
              <div key={f.id} className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 relative group">
                <img src={f.preview} alt={f.file.name} className="w-full h-20 object-cover" />
                <div className="px-2 py-1">
                  <p className="text-xs truncate text-gray-600 dark:text-gray-400">{f.file.name}</p>
                  <p className="text-xs text-gray-400">{formatFileSize(f.file.size)}</p>
                </div>
              </div>
            ))}
          </div>

          <div>
            <Label>Convert to</Label>
            <div className="flex gap-2">
              {FORMATS.map(f => (
                <Button
                  key={f.mime}
                  variant="outline"
                  onClick={() => setTargetMime(f.mime)}
                  className={`transition-all ${targetMime === f.mime ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/30 text-brand-700 dark:text-brand-300' : 'text-gray-600 dark:text-gray-400'}`}
                >
                  {f.label}
                </Button>
              ))}
            </div>
          </div>

          {targetMime !== 'image/png' && (
            <div>
              <Label>Quality: {quality}%</Label>
              <Slider min={10} max={100} step={1} value={[quality]} onValueChange={([v]) => setQuality(v)} />
            </div>
          )}

          {status === 'processing' && <ProgressBar progress={progress} label="Converting..." />}
          {status === 'error' && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-4 py-3 rounded-xl">{error}</p>}

          <div className="flex gap-3">
            <Button onClick={convert} disabled={status === 'processing'} >
              {status === 'processing' ? 'Converting...' : `Convert ${files.length} image${files.length > 1 ? 's' : ''}`}
            </Button>
            <Button variant="secondary" onClick={() => { files.forEach(f => URL.revokeObjectURL(f.preview)); updateFiles(() => []); setOutput([]); }} >Reset</Button>
          </div>
        </div>
      )}

      {output.length > 0 && <OutputFiles files={output} />}
    </div>
  );
}
