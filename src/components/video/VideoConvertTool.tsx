import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FcVideoFile } from 'react-icons/fc';
import { useState } from 'react';
import DropZone from '@/components/shared/DropZone';
import ProgressBar from '@/components/shared/ProgressBar';
import OutputFiles, { type OutputFile } from '@/components/shared/OutputFiles';
import { convertVideo, type VideoFormat } from '@/lib/video/videoConvert';
import { formatFileSize } from '@/lib/utils/fileUtils';

const FORMATS: { label: string; value: VideoFormat; desc: string }[] = [
  { label: 'MP4', value: 'mp4', desc: 'Universal compatibility' },
  { label: 'WebM', value: 'webm', desc: 'Web optimized' },
  { label: 'AVI', value: 'avi', desc: 'Windows format' },
  { label: 'MOV', value: 'mov', desc: 'Apple format' },
  { label: 'GIF', value: 'gif', desc: 'Animated image' },
];

export default function VideoConvertTool() {
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<VideoFormat>('mp4');
  const [status, setStatus] = useState<'idle' | 'processing' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [output, setOutput] = useState<OutputFile[]>([]);
  const [error, setError] = useState('');

  const addFile = ([f]: File[]) => { setFile(f); setStatus('idle'); setOutput([]); };

  const convert = async () => {
    if (!file) return;
    setStatus('processing'); setProgress(0); setError('');
    try {
      const result = await convertVideo(file, format, setProgress);
      setOutput([{ name: result.name, blob: result.blob, size: result.blob.size }]);
      setStatus('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Conversion failed'); setStatus('error');
    }
  };

  return (
    <div className="space-y-5">
      {!file ? (
        <DropZone onFiles={addFile} accept="video/*" multiple={false} label="Drop a video file" />
      ) : (
        <div className="flex items-center gap-3 px-4 py-3 card rounded-xl border">
          <FcVideoFile size={28} />
          <div className="flex-1">
            <p className="font-medium text-gray-900 dark:text-gray-100">{file.name}</p>
            <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => { setFile(null); setOutput([]); }}>Change</Button>
        </div>
      )}

      {file && (
        <div className="card p-5 space-y-5">
          <div>
            <label className="label">Convert to</label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {FORMATS.map(f => (
                <Button
                  key={f.value}
                  variant="outline"
                  onClick={() => setFormat(f.value)}
                  className={`h-auto flex-col py-2 px-2 transition-all ${format === f.value ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/30 text-brand-700 dark:text-brand-300' : 'text-gray-600 dark:text-gray-400'}`}
                >
                  <div className="font-bold">{f.label}</div>
                  <div className="text-xs opacity-70">{f.desc}</div>
                </Button>
              ))}
            </div>
          </div>

          {status === 'processing' && <ProgressBar progress={progress} label="Converting video..." />}
          {status === 'error' && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-4 py-3 rounded-xl">{error}</p>}

          <Button onClick={convert} disabled={status === 'processing'} >
            {status === 'processing' ? 'Converting...' : `Convert to ${format.toUpperCase()}`}
          </Button>
        </div>
      )}

      {output.length > 0 && <OutputFiles files={output} />}
    </div>
  );
}
