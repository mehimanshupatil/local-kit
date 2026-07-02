import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FilmSlateIcon } from '@phosphor-icons/react';
import { useState, useEffect } from 'react';
import { useImmer } from 'use-immer';
import DropZone from '@/components/shared/DropZone';
import ProgressBar from '@/components/shared/ProgressBar';
import OutputFiles from '@/components/shared/OutputFiles';
import { removeAudio } from '@/lib/video/videoRemoveAudio';
import { type ToolOp, IDLE_OP } from '@/lib/utils/toolState';
import { formatFileSize } from '@/lib/utils/fileUtils';
import { useToolVisit } from '@/stores/toolVisit';

export default function VideoRemoveAudioTool() {
  const [file, setFile] = useState<File | null>(null);
  const [op, updateOp] = useImmer<ToolOp>({ ...IDLE_OP });
  const { status, progress, output, error } = op;
  const { sessionFiles, setSessionFiles, clearSession } = useToolVisit('video', '/video/remove-audio');

  useEffect(() => { if (sessionFiles.length > 0 && !file) { addFile([sessionFiles[0]]); } }, []);

  const addFile = ([f]: File[]) => {
    setFile(f);
    updateOp(() => ({ ...IDLE_OP }));
    setSessionFiles([f]);
  };

  const process = async () => {
    if (!file) return;
    updateOp(d => { d.status = 'processing'; d.progress = 0; d.error = ''; });
    try {
      const result = await removeAudio(file, pct => updateOp(d => { d.progress = pct; }));
      updateOp(d => { d.output = [{ name: result.name, blob: result.blob, size: result.blob.size }]; d.status = 'done'; });
    } catch (e) {
      updateOp(d => { d.error = e instanceof Error ? e.message : 'Processing failed'; d.status = 'error'; });
    }
  };

  const outputFile = output[0];

  return (
    <div className="space-y-5">
      {!file ? (
        <DropZone onFiles={addFile} accept="video/*" multiple={false} label="Drop a video file" sublabel="MP4, WebM, MOV, AVI and more" />
      ) : (
        <Card className="flex items-center gap-3 px-4 py-3 rounded-xl border">
          <FilmSlateIcon size={28} />
          <div className="flex-1">
            <p className="font-medium text-foreground">{file.name}</p>
            <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => { setFile(null); updateOp(() => ({ ...IDLE_OP })); clearSession(); }}>Change</Button>
        </Card>
      )}

      {file && (
        <Card className="p-5 space-y-4">
          {status === 'done' && outputFile && (
            <div className="flex items-center justify-between text-sm rounded-lg bg-muted/50 px-4 py-3">
              <span className="text-muted-foreground">Original</span>
              <span className="font-medium">{formatFileSize(file.size)}</span>
              <span className="text-muted-foreground">→</span>
              <span className="text-muted-foreground">Output</span>
              <span className="font-medium text-green-500">{formatFileSize(outputFile.size)}</span>
            </div>
          )}

          {status === 'processing' && <ProgressBar progress={progress} label="Removing audio track..." />}
          {status === 'error' && <p className="text-sm text-red-500 bg-red-500/10 px-4 py-3 rounded-xl">{error}</p>}

          <Button onClick={process} disabled={status === 'processing'}>
            {status === 'processing' ? 'Processing...' : 'Remove Audio'}
          </Button>
        </Card>
      )}

      {output.length > 0 && <OutputFiles files={output} />}
    </div>
  );
}
