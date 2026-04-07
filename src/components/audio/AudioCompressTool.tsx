import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import DropZone from '@/components/shared/DropZone';
import ProgressBar from '@/components/shared/ProgressBar';
import OutputFiles, { type OutputFile } from '@/components/shared/OutputFiles';
import { compressAudio, type AudioBitrate } from '@/lib/audio/audioCompress';
import { formatFileSize } from '@/lib/utils/fileUtils';

const BITRATES: { value: AudioBitrate; label: string; note: string }[] = [
  { value: '320k', label: '320k', note: 'Best quality' },
  { value: '256k', label: '256k', note: 'Near lossless' },
  { value: '192k', label: '192k', note: 'High quality' },
  { value: '128k', label: '128k', note: 'Good quality' },
  { value: '96k',  label: '96k',  note: 'Smaller file' },
  { value: '64k',  label: '64k',  note: 'Smallest' },
];

export default function AudioCompressTool() {
  const [file,     setFile]     = useState<File | null>(null);
  const [bitrate,  setBitrate]  = useState<AudioBitrate>('128k');
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

  const compress = async () => {
    if (!file) return;
    setStatus('processing'); setProgress(0); setError('');
    try {
      const result = await compressAudio(file, bitrate, setProgress);
      setOutput([{ name: result.name, blob: result.blob, size: result.blob.size }]);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(URL.createObjectURL(result.blob));
      setStatus('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Compression failed'); setStatus('error');
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
          <span className="text-2xl">🎵</span>
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
            <label className="label">Target bitrate</label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {BITRATES.map(b => (
                <Button
                  key={b.value}
                  variant="outline"
                  onClick={() => setBitrate(b.value)}
                  className={`h-auto flex-col py-2 px-2 transition-all ${bitrate === b.value ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/30 text-brand-700 dark:text-brand-300' : 'text-gray-600 dark:text-gray-400'}`}
                >
                  <div className="font-bold">{b.label}</div>
                  <div className="text-xs opacity-70">{b.note}</div>
                </Button>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Lower bitrate = smaller file size but lower audio quality. 128k is a good balance for most audio.
            </p>
          </div>

          {status === 'processing' && <ProgressBar progress={progress} label="Compressing audio..." />}
          {status === 'error' && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-4 py-3 rounded-xl">{error}</p>}

          <Button onClick={compress} disabled={status === 'processing'}>
            {status === 'processing' ? 'Compressing...' : `Compress at ${bitrate}`}
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
