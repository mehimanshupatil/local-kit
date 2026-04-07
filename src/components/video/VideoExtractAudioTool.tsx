import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FcVideoFile } from 'react-icons/fc';
import { useState, useEffect } from 'react';
import DropZone from '@/components/shared/DropZone';
import ProgressBar from '@/components/shared/ProgressBar';
import OutputFiles, { type OutputFile } from '@/components/shared/OutputFiles';
import { extractAudio, type AudioFormat } from '@/lib/video/videoExtractAudio';
import { formatFileSize } from '@/lib/utils/fileUtils';

const FORMATS: { label: string; value: AudioFormat; desc: string }[] = [
  { label: 'MP3', value: 'mp3', desc: 'Universal' },
  { label: 'AAC', value: 'aac', desc: 'High quality' },
  { label: 'WAV', value: 'wav', desc: 'Lossless' },
  { label: 'OGG', value: 'ogg', desc: 'Open source' },
];

export default function VideoExtractAudioTool() {
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<AudioFormat>('mp3');
  const [status, setStatus] = useState<'idle' | 'processing' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [output, setOutput] = useState<OutputFile[]>([]);
  const [error, setError] = useState('');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => { if (audioUrl) URL.revokeObjectURL(audioUrl); };
  }, [audioUrl]);

  const addFile = ([f]: File[]) => {
    setFile(f); setStatus('idle'); setOutput([]);
    if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(null); }
  };

  const extract = async () => {
    if (!file) return;
    setStatus('processing'); setProgress(0); setError('');
    try {
      const result = await extractAudio(file, format, setProgress);
      setOutput([{ name: result.name, blob: result.blob, size: result.blob.size }]);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(URL.createObjectURL(result.blob));
      setStatus('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Extraction failed'); setStatus('error');
    }
  };

  return (
    <div className="space-y-5">
      {!file ? (
        <DropZone onFiles={addFile} accept="video/*" multiple={false} label="Drop a video file" sublabel="Extract audio track as MP3, AAC, WAV or OGG" />
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
            <label className="label">Audio format</label>
            <div className="grid grid-cols-4 gap-2">
              {FORMATS.map(f => (
                <Button
                  key={f.value}
                  variant="outline"
                  onClick={() => setFormat(f.value)}
                  className={`h-auto flex-col transition-all ${format === f.value ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/30 text-brand-700 dark:text-brand-300' : 'text-gray-600 dark:text-gray-400'}`}
                >
                  <div className="font-bold">{f.label}</div>
                  <div className="text-xs opacity-70">{f.desc}</div>
                </Button>
              ))}
            </div>
          </div>

          {status === 'processing' && <ProgressBar progress={progress} label="Extracting audio..." />}
          {status === 'error' && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-4 py-3 rounded-xl">{error}</p>}

          <Button onClick={extract} disabled={status === 'processing'} >
            {status === 'processing' ? 'Extracting...' : `Extract as ${format.toUpperCase()}`}
          </Button>
        </div>
      )}

      {audioUrl && (
        <div className="card p-4 space-y-2">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Preview</p>
          <audio
            src={audioUrl}
            controls
            className="w-full h-10"
          />
        </div>
      )}

      {output.length > 0 && <OutputFiles files={output} />}
    </div>
  );
}
