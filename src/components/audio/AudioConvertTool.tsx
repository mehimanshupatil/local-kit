import { Button } from '@/components/ui/button';
import { FcMusic } from 'react-icons/fc';
import { useState, useEffect } from 'react';
import DropZone from '@/components/shared/DropZone';
import ProgressBar from '@/components/shared/ProgressBar';
import OutputFiles, { type OutputFile } from '@/components/shared/OutputFiles';
import { convertAudio, type AudioFormat } from '@/lib/audio/audioConvert';
import { formatFileSize } from '@/lib/utils/fileUtils';

const FORMATS: { label: string; value: AudioFormat; desc: string }[] = [
  { label: 'MP3',  value: 'mp3',  desc: 'Universal' },
  { label: 'AAC',  value: 'aac',  desc: 'High quality' },
  { label: 'WAV',  value: 'wav',  desc: 'Lossless' },
  { label: 'OGG',  value: 'ogg',  desc: 'Open source' },
  { label: 'FLAC', value: 'flac', desc: 'Lossless compressed' },
];

export default function AudioConvertTool() {
  const [file,     setFile]     = useState<File | null>(null);
  const [format,   setFormat]   = useState<AudioFormat>('mp3');
  const [status,   setStatus]   = useState<'idle' | 'processing' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [output,   setOutput]   = useState<OutputFile[]>([]);
  const [error,    setError]    = useState('');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => { if (audioUrl) URL.revokeObjectURL(audioUrl); };
  }, [audioUrl]);

  const addFile = ([f]: File[]) => {
    setFile(f); setStatus('idle'); setOutput([]);
    if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(null); }
  };

  const convert = async () => {
    if (!file) return;
    setStatus('processing'); setProgress(0); setError('');
    try {
      const result = await convertAudio(file, format, setProgress);
      setOutput([{ name: result.name, blob: result.blob, size: result.blob.size }]);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(URL.createObjectURL(result.blob));
      setStatus('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Conversion failed'); setStatus('error');
    }
  };

  return (
    <div className="space-y-5">
      {!file ? (
        <DropZone
          onFiles={addFile}
          accept="audio/*,.mp3,.aac,.wav,.ogg,.flac,.m4a"
          multiple={false}
          label="Drop an audio file"
          sublabel="MP3, AAC, WAV, OGG, FLAC, M4A supported"
        />
      ) : (
        <div className="flex items-center gap-3 px-4 py-3 card rounded-xl border">
          <FcMusic size={28} />
          <div className="flex-1">
            <p className="font-medium text-gray-900 dark:text-gray-100">{file.name}</p>
            <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => { setFile(null); setOutput([]); if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(null); } }}>Change</Button>
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

          {status === 'processing' && <ProgressBar progress={progress} label="Converting audio..." />}
          {status === 'error' && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-4 py-3 rounded-xl">{error}</p>}

          <Button onClick={convert} disabled={status === 'processing'}>
            {status === 'processing' ? 'Converting...' : `Convert to ${format.toUpperCase()}`}
          </Button>
        </div>
      )}

      {audioUrl && (
        <div className="card p-4 space-y-2">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Preview</p>
          <audio src={audioUrl} controls className="w-full h-10" />
        </div>
      )}

      {output.length > 0 && <OutputFiles files={output} />}
    </div>
  );
}
