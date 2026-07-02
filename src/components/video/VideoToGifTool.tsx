import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { FilmSlateIcon } from '@phosphor-icons/react';
import { useState, useEffect } from 'react';
import { useImmer } from 'use-immer';
import DropZone from '@/components/shared/DropZone';
import ProgressBar from '@/components/shared/ProgressBar';
import OutputFiles from '@/components/shared/OutputFiles';
import { videoToGif } from '@/lib/video/videoToGif';
import { type ToolOp, IDLE_OP } from '@/lib/utils/toolState';
import { formatFileSize } from '@/lib/utils/fileUtils';
import { useToolVisit } from '@/stores/toolVisit';

const FPS_OPTIONS = [5, 10, 15, 24] as const;
const WIDTH_OPTIONS = [240, 360, 480, 720] as const;

export default function VideoToGifTool() {
  const [file, setFile] = useState<File | null>(null);
  const [fps, setFps] = useState(10);
  const [width, setWidth] = useState(480);
  const [op, updateOp] = useImmer<ToolOp>({ ...IDLE_OP });
  const { status, progress, output, error } = op;
  const { sessionFiles, setSessionFiles, clearSession } = useToolVisit('video', '/video/to-gif');

  useEffect(() => { if (sessionFiles.length > 0 && !file) { addFile([sessionFiles[0]]); } }, []);

  const addFile = ([f]: File[]) => {
    setFile(f);
    updateOp(() => ({ ...IDLE_OP }));
    setSessionFiles([f]);
  };

  const convert = async () => {
    if (!file) return;
    updateOp(d => { d.status = 'processing'; d.progress = 0; d.error = ''; });
    try {
      const result = await videoToGif(file, fps, width, pct => updateOp(d => { d.progress = pct; }));
      updateOp(d => { d.output = [{ name: result.name, blob: result.blob, size: result.blob.size }]; d.status = 'done'; });
    } catch (e) {
      updateOp(d => { d.error = e instanceof Error ? e.message : 'Conversion failed'; d.status = 'error'; });
    }
  };

  return (
    <div className="space-y-5">
      {!file ? (
        <DropZone onFiles={addFile} accept="video/*" multiple={false} label="Drop a video file" sublabel="MP4, WebM, MOV and more" />
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
        <Card className="p-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label>Frame rate (FPS)</Label>
              <div className="flex gap-2 flex-wrap">
                {FPS_OPTIONS.map(f => (
                  <Button
                    key={f}
                    variant="outline"
                    size="sm"
                    onClick={() => setFps(f)}
                    className={`transition-all ${fps === f ? 'border-brand-500 bg-brand-500/10 text-brand-400' : 'text-muted-foreground'}`}
                  >
                    {f} fps
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Width (px)</Label>
              <div className="flex gap-2 flex-wrap">
                {WIDTH_OPTIONS.map(w => (
                  <Button
                    key={w}
                    variant="outline"
                    size="sm"
                    onClick={() => setWidth(w)}
                    className={`transition-all ${width === w ? 'border-brand-500 bg-brand-500/10 text-brand-400' : 'text-muted-foreground'}`}
                  >
                    {w}px
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 px-3 py-2 rounded-lg">
            GIFs can be large files. Consider compressing for web use after export.
          </p>

          {status === 'processing' && <ProgressBar progress={progress} label="Converting to GIF..." />}
          {status === 'error' && <p className="text-sm text-red-500 bg-red-500/10 px-4 py-3 rounded-xl">{error}</p>}

          <Button onClick={convert} disabled={status === 'processing'}>
            {status === 'processing' ? 'Converting...' : 'Convert to GIF'}
          </Button>
        </Card>
      )}

      {output.length > 0 && <OutputFiles files={output} />}
    </div>
  );
}
