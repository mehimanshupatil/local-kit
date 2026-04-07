import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import DropZone from '@/components/shared/DropZone';
import ProgressBar from '@/components/shared/ProgressBar';
import OutputFiles, { type OutputFile } from '@/components/shared/OutputFiles';
import { pdfToImages } from '@/lib/pdf/pdfToImages';
import PDFFileBar from './PDFFileBar';

export default function PDFToImagesTool() {
  const [file, setFile] = useState<{ name: string; size: number; buffer: ArrayBuffer } | null>(null);
  const [scale, setScale] = useState(1.5);
  const [status, setStatus] = useState<'idle' | 'processing' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [output, setOutput] = useState<OutputFile[]>([]);
  const [error, setError] = useState('');

  const addFile = async ([f]: File[]) => {
    setFile({ name: f.name, size: f.size, buffer: await f.arrayBuffer() });
    setStatus('idle'); setOutput([]);
  };

  const convert = async () => {
    if (!file) return;
    setStatus('processing'); setProgress(0); setError('');
    try {
      const results = await pdfToImages(file.buffer, file.name, scale, setProgress);
      setOutput(results.map(r => ({ name: r.name, blob: r.blob, size: r.blob.size })));
      setStatus('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Conversion failed'); setStatus('error');
    }
  };

  const resolutions: { label: string; value: number }[] = [
    { label: '72 DPI (screen)', value: 1 },
    { label: '108 DPI (standard)', value: 1.5 },
    { label: '144 DPI (high)', value: 2 },
    { label: '216 DPI (print)', value: 3 },
  ];

  return (
    <div className="space-y-5">
      {!file ? (
        <DropZone onFiles={addFile} accept=".pdf,application/pdf" multiple={false} label="Drop a PDF file" />
      ) : (
        <PDFFileBar file={file} onClear={() => { setFile(null); setOutput([]); }} />
      )}

      {file && (
        <div className="card p-5 space-y-5">
          <div>
            <label className="label">Output resolution</label>
            <select value={scale} onChange={e => setScale(parseFloat(e.target.value))} className="input">
              {resolutions.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>

          {status === 'processing' && <ProgressBar progress={progress} label="Converting pages..." />}
          {status === 'error' && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-4 py-3 rounded-xl">{error}</p>}

          <Button onClick={convert} disabled={status === 'processing'} >
            {status === 'processing' ? 'Converting...' : 'Convert to Images'}
          </Button>
        </div>
      )}

      {output.length > 0 && <OutputFiles files={output} />}
    </div>
  );
}
