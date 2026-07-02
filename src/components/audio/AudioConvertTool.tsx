import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { MusicNotesIcon } from '@phosphor-icons/react';
import { useState, useEffect } from 'react';
import { useImmer } from 'use-immer';
import DropZone from '@/components/shared/DropZone';
import ProgressBar from '@/components/shared/ProgressBar';
import OutputFiles  from '@/components/shared/OutputFiles';
import { convertAudio, type AudioFormat } from '@/lib/audio/audioConvert';
import { type ToolOp, IDLE_OP } from '@/lib/utils/toolState';
import { formatFileSize } from '@/lib/utils/fileUtils';
import { useToolPrefs } from '@/stores/prefsStore';
import { useToolVisit } from '@/stores/toolVisit';

const FORMATS: { label: string; value: AudioFormat; desc: string }[] = [
  { label: 'MP3',  value: 'mp3',  desc: 'Universal' },
  { label: 'AAC',  value: 'aac',  desc: 'High quality' },
  { label: 'WAV',  value: 'wav',  desc: 'Lossless' },
  { label: 'OGG',  value: 'ogg',  desc: 'Open source' },
  { label: 'FLAC', value: 'flac', desc: 'Lossless compressed' },
];

export default function AudioConvertTool() {

  const [prefs, updatePrefs] = useToolPrefs('/audio/convert', { format: 'mp3' as AudioFormat });
  const { format } = prefs;
  const setFormat = (v: AudioFormat) => updatePrefs({ format: v });

  const [file,     setFile]     = useState<File | null>(null);
  const [op, updateOp] = useImmer<ToolOp>({ ...IDLE_OP });
  const { status, progress, output, error } = op;
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const { sessionFiles, setSessionFiles, clearSession } = useToolVisit('audio', '/audio/convert');

  useEffect(() => {
    return () => { if (audioUrl) URL.revokeObjectURL(audioUrl); };
  }, [audioUrl]);

  useEffect(() => { if (sessionFiles.length > 0 && !file) { addFile([sessionFiles[0]]); } }, []);

  const addFile = ([f]: File[]) => {
    setFile(f); updateOp(() => ({ ...IDLE_OP }));
    if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(null); }
    setSessionFiles([f]);
  };

  const convert = async () => {
    if (!file) return;
    updateOp(d => { d.status = 'processing'; d.progress = 0; d.error = ''; });
    try {
      const result = await convertAudio(file, format, pct => updateOp(d => { d.progress = pct; }));
      updateOp(d => { d.output = [{ name: result.name, blob: result.blob, size: result.blob.size }]; d.status = 'done'; });
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(URL.createObjectURL(result.blob));
    } catch (e) {
      updateOp(d => { d.error = e instanceof Error ? e.message : 'Conversion failed'; d.status = 'error'; });
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
          <MusicNotesIcon size={28} />
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
            <Label>Convert to</Label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {FORMATS.map(f => (
                <Button
                  key={f.value}
                  variant="outline"
                  onClick={() => setFormat(f.value)}
                  className={`h-auto flex-col py-2 px-2 transition-all ${format === f.value ? 'border-brand-500 bg-brand-500/10 text-brand-400' : 'text-muted-foreground'}`}
                >
                  <div className="font-bold">{f.label}</div>
                  <div className="text-xs opacity-70">{f.desc}</div>
                </Button>
              ))}
            </div>
          </div>

          {status === 'processing' && <ProgressBar progress={progress} label="Converting audio..." />}
          {status === 'error' && <p className="text-sm text-red-500 bg-red-500/10 px-4 py-3 rounded-xl">{error}</p>}

          <Button onClick={convert} disabled={status === 'processing'}>
            {status === 'processing' ? 'Converting...' : `Convert to ${format.toUpperCase()}`}
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
