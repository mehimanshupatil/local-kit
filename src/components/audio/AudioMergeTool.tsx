import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { FcMusic } from 'react-icons/fc';
import { useState } from 'react';
import { useImmer } from 'use-immer';
import DropZone from '@/components/shared/DropZone';
import ProgressBar from '@/components/shared/ProgressBar';
import OutputFiles from '@/components/shared/OutputFiles';
import { mergeAudio, type MergeAudioFormat } from '@/lib/audio/audioMerge';
import { type ToolOp, IDLE_OP } from '@/lib/utils/toolState';
import { formatFileSize } from '@/lib/utils/fileUtils';
import { useToolVisit } from '@/stores/toolVisit';

const FORMATS: { label: string; value: MergeAudioFormat; desc: string }[] = [
  { label: 'MP3', value: 'mp3', desc: 'Universal' },
  { label: 'AAC', value: 'aac', desc: 'High quality' },
  { label: 'WAV', value: 'wav', desc: 'Lossless' },
];

export default function AudioMergeTool() {
  const [files, setFiles] = useState<File[]>([]);
  const [format, setFormat] = useState<MergeAudioFormat>('mp3');
  const [op, updateOp] = useImmer<ToolOp>({ ...IDLE_OP });
  const { status, progress, output, error } = op;
  const { setSessionFiles } = useToolVisit('audio', '/audio/merge');

  const addFiles = (incoming: File[]) => {
    setFiles(prev => {
      const next = [...prev, ...incoming];
      setSessionFiles(next);
      return next;
    });
    updateOp(() => ({ ...IDLE_OP }));
  };

  const removeFile = (index: number) => {
    setFiles(prev => {
      const next = prev.filter((_, i) => i !== index);
      setSessionFiles(next);
      return next;
    });
    updateOp(() => ({ ...IDLE_OP }));
  };

  const moveFile = (index: number, direction: 'up' | 'down') => {
    setFiles(prev => {
      const next = [...prev];
      const swapIndex = direction === 'up' ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= next.length) return next;
      [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
      return next;
    });
  };

  const merge = async () => {
    if (files.length < 2) return;
    updateOp(d => { d.status = 'processing'; d.progress = 0; d.error = ''; });
    try {
      const result = await mergeAudio(files, format, pct => updateOp(d => { d.progress = pct; }));
      updateOp(d => { d.output = [{ name: result.name, blob: result.blob, size: result.blob.size }]; d.status = 'done'; });
    } catch (e) {
      updateOp(d => { d.error = e instanceof Error ? e.message : 'Merge failed'; d.status = 'error'; });
    }
  };

  return (
    <div className="space-y-5">
      <DropZone
        onFiles={addFiles}
        accept="audio/*,.mp3,.aac,.wav,.ogg,.flac,.m4a"
        multiple={true}
        label="Drop audio files here"
        sublabel="MP3, AAC, WAV, OGG, FLAC, M4A — add as many as you need"
      />

      {files.length > 0 && (
        <Card className="p-4 space-y-2">
          <p className="text-sm font-semibold text-foreground mb-3">Files to merge ({files.length})</p>
          <div className="space-y-2">
            {files.map((f, i) => (
              <div key={`${f.name}-${i}`} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/40 border">
                <FcMusic size={20} className="shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{f.name}</p>
                  <p className="text-xs text-muted-foreground">{formatFileSize(f.size)}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    disabled={i === 0}
                    onClick={() => moveFile(i, 'up')}
                    aria-label="Move up"
                  >
                    ↑
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    disabled={i === files.length - 1}
                    onClick={() => moveFile(i, 'down')}
                    aria-label="Move down"
                  >
                    ↓
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
                    onClick={() => removeFile(i)}
                    aria-label="Remove file"
                  >
                    ×
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {files.length > 0 && (
        <Card className="p-5 space-y-5">
          <div>
            <Label>Output format</Label>
            <div className="grid grid-cols-3 gap-2 mt-2">
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

          {files.length < 2 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 px-3 py-2 rounded-lg">
              Add at least 2 audio files to merge.
            </p>
          )}

          {status === 'processing' && <ProgressBar progress={progress} label="Merging audio files..." />}
          {status === 'error' && <p className="text-sm text-red-500 bg-red-500/10 px-4 py-3 rounded-xl">{error}</p>}

          <Button onClick={merge} disabled={status === 'processing' || files.length < 2}>
            {status === 'processing' ? 'Merging...' : `Merge ${files.length} files to ${format.toUpperCase()}`}
          </Button>
        </Card>
      )}

      {output.length > 0 && <OutputFiles files={output} />}
    </div>
  );
}
