import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { FcMusic } from 'react-icons/fc';
import { useState, useEffect } from 'react';
import { useImmer } from 'use-immer';
import DropZone from '@/components/shared/DropZone';
import ProgressBar from '@/components/shared/ProgressBar';
import OutputFiles, { type OutputFile } from '@/components/shared/OutputFiles';
import { compressAudio, type AudioBitrate } from '@/lib/audio/audioCompress';
import { type ToolOp, IDLE_OP } from '@/lib/utils/toolState';
import { formatFileSize } from '@/lib/utils/fileUtils';
import { useToolPrefs } from '@/stores/prefsStore';
import { useToolVisit } from '@/stores/toolVisit';

const BITRATES: { value: AudioBitrate; label: string; note: string }[] = [
  { value: '320k', label: '320k', note: 'Best quality' },
  { value: '256k', label: '256k', note: 'Near lossless' },
  { value: '192k', label: '192k', note: 'High quality' },
  { value: '128k', label: '128k', note: 'Good quality' },
  { value: '96k',  label: '96k',  note: 'Smaller file' },
  { value: '64k',  label: '64k',  note: 'Smallest' },
];

export default function AudioCompressTool() {

  const [prefs, updatePrefs] = useToolPrefs('/audio/compress', { bitrate: '128k' as AudioBitrate });
  const { bitrate } = prefs;
  const setBitrate = (v: AudioBitrate) => updatePrefs({ bitrate: v });

  const [file,     setFile]     = useState<File | null>(null);
  const [op, updateOp] = useImmer<ToolOp>({ ...IDLE_OP });
  const { status, progress, output, error } = op;
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const { sessionFiles, setSessionFiles, clearSession } = useToolVisit('audio', '/audio/compress');

  useEffect(() => {
    return () => { if (audioUrl) URL.revokeObjectURL(audioUrl); };
  }, [audioUrl]);

  useEffect(() => { if (sessionFiles.length > 0 && !file) { addFile([sessionFiles[0]]); } }, []);

  const addFile = ([f]: File[]) => {
    setFile(f); updateOp(() => ({ ...IDLE_OP }));
    if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(null); }
    setSessionFiles([f]);
  };

  const compress = async () => {
    if (!file) return;
    updateOp(d => { d.status = 'processing'; d.progress = 0; d.error = ''; });
    try {
      const result = await compressAudio(file, bitrate, pct => updateOp(d => { d.progress = pct; }));
      updateOp(d => { d.output = [{ name: result.name, blob: result.blob, size: result.blob.size }]; d.status = 'done'; });
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(URL.createObjectURL(result.blob));
    } catch (e) {
      updateOp(d => { d.error = e instanceof Error ? e.message : 'Compression failed'; d.status = 'error'; });
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
        <Card className="flex items-center gap-3 px-4 py-3 rounded-xl border">
          <FcMusic size={28} />
          <div className="flex-1">
            <p className="font-medium text-foreground">{file.name}</p>
            <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => { setFile(null); updateOp(() => ({ ...IDLE_OP })); if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(null); } clearSession(); }}>Change</Button>
        </Card>
      )}

      {file && (
        <Card className="p-5 space-y-5">
          <div>
            <Label>Target bitrate</Label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {BITRATES.map(b => (
                <Button
                  key={b.value}
                  variant="outline"
                  onClick={() => setBitrate(b.value)}
                  className={`h-auto flex-col py-2 px-2 transition-all ${bitrate === b.value ? 'border-brand-500 bg-brand-500/10 text-brand-400' : 'text-muted-foreground'}`}
                >
                  <div className="font-bold">{b.label}</div>
                  <div className="text-xs opacity-70">{b.note}</div>
                </Button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Lower bitrate = smaller file size but lower audio quality. 128k is a good balance for most audio.
            </p>
          </div>

          {status === 'processing' && <ProgressBar progress={progress} label="Compressing audio..." />}
          {status === 'error' && <p className="text-sm text-red-500 bg-red-500/10 px-4 py-3 rounded-xl">{error}</p>}

          <Button onClick={compress} disabled={status === 'processing'}>
            {status === 'processing' ? 'Compressing...' : `Compress at ${bitrate}`}
          </Button>
        </Card>
      )}

      {audioUrl && (
        <Card className="p-4 space-y-2">
          <p className="text-sm font-semibold text-foreground">Preview</p>
          <audio src={audioUrl} controls className="w-full h-10" />
        </Card>
      )}

      {output.length > 0 && <OutputFiles files={output} />}
    </div>
  );
}
