import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { useImmer } from 'use-immer';
import DropZone from '@/components/shared/DropZone';
import FileList from '@/components/shared/FileList';
import ProgressBar from '@/components/shared/ProgressBar';
import OutputFiles, { type OutputFile } from '@/components/shared/OutputFiles';
import { imagesToPDF } from '@/lib/pdf/pdfFromImages';
import { generateId } from '@/lib/utils/fileUtils';

interface FileEntry { id: string; name: string; size: number; buffer: ArrayBuffer; type: string; preview: string }

export default function PDFFromImagesTool() {
  const [files, updateFiles] = useImmer<FileEntry[]>([]);
  const [status, setStatus] = useState<'idle' | 'processing' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [output, setOutput] = useState<OutputFile[]>([]);
  const [error, setError] = useState('');

  const addFiles = async (incoming: File[]) => {
    const entries = await Promise.all(
      incoming.filter(f => f.type.startsWith('image/')).map(async f => ({
        id: generateId(), name: f.name, size: f.size, type: f.type,
        buffer: await f.arrayBuffer(), preview: URL.createObjectURL(f),
      }))
    );
    updateFiles(draft => { draft.push(...entries); });
    setStatus('idle'); setOutput([]);
  };

  const remove = (id: string) => {
    const f = files.find(f => f.id === id);
    if (f) URL.revokeObjectURL(f.preview);
    updateFiles(draft => { const i = draft.findIndex(f => f.id === id); if (i !== -1) draft.splice(i, 1); });
  };

  const convert = async () => {
    if (files.length === 0) return;
    setStatus('processing'); setProgress(0); setError('');
    try {
      const blob = await imagesToPDF(files.map(f => ({ buffer: f.buffer, type: f.type })), setProgress);
      setOutput([{ name: 'images.pdf', blob, size: blob.size }]);
      setStatus('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Conversion failed'); setStatus('error');
    }
  };

  return (
    <div className="space-y-5">
      <DropZone onFiles={addFiles} accept="image/*" label="Drop images here" sublabel="JPG, PNG images will be combined into a PDF" />

      {files.length > 0 && (
        <div className="card p-5 space-y-4">
          <FileList files={files.map(f => ({ id: f.id, name: f.name, size: f.size, preview: f.preview }))} onRemove={remove} />

          {status === 'processing' && <ProgressBar progress={progress} label="Creating PDF..." />}
          {status === 'error' && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-4 py-3 rounded-xl">{error}</p>}

          <div className="flex gap-3">
            <Button onClick={convert} disabled={files.length === 0 || status === 'processing'} >
              {status === 'processing' ? 'Creating PDF...' : `Create PDF from ${files.length} image${files.length > 1 ? 's' : ''}`}
            </Button>
            <Button variant="secondary" onClick={() => { files.forEach(f => URL.revokeObjectURL(f.preview)); updateFiles(() => []); setOutput([]); }} >Reset</Button>
          </div>
        </div>
      )}

      {output.length > 0 && <OutputFiles files={output} />}
    </div>
  );
}
