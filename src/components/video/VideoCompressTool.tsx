import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { FilmSlateIcon } from '@phosphor-icons/react';
import { useState, useEffect } from 'react';
import { useImmer } from 'use-immer';
import DropZone from '@/components/shared/DropZone';
import ProgressBar from '@/components/shared/ProgressBar';
import OutputFiles from '@/components/shared/OutputFiles';
import { compressVideo, type VideoQuality } from '@/lib/video/videoCompress';
import { type ToolOp, IDLE_OP } from '@/lib/utils/toolState';
import { formatFileSize } from '@/lib/utils/fileUtils';
import { useToolPrefs } from '@/stores/prefsStore';
import { useToolVisit } from '@/stores/toolVisit';

export default function VideoCompressTool() {

  const [prefs, updatePrefs] = useToolPrefs('/video/compress', { quality: 'medium' as VideoQuality });
  const { quality } = prefs;
  const setQuality = (v: VideoQuality) => updatePrefs({ quality: v });

  const [file, setFile] = useState<File | null>(null);
  const [op, updateOp] = useImmer<ToolOp>({ ...IDLE_OP });
  const { status, progress, output, error } = op;
  const [log, setLog] = useState('');
  const { sessionFiles, setSessionFiles, clearSession } = useToolVisit('video', '/video/compress');

  useEffect(() => { if (sessionFiles.length > 0 && !file) { addFile([sessionFiles[0]]); } }, []);

  const addFile = ([f]: File[]) => { setFile(f); updateOp(() => ({ ...IDLE_OP })); setSessionFiles([f]); };

  const compress = async () => {
    if (!file) return;
    updateOp(d => { d.status = 'loading'; d.progress = 0; d.error = ''; });
    setLog('Loading FFmpeg WASM...');
    try {
      updateOp(d => { d.status = 'processing'; });
      const result = await compressVideo(file, quality, (pct) => { updateOp(d => { d.progress = pct; }); setLog(`Compressing... ${pct}%`); });
      updateOp(d => { d.output = [{ name: result.name, blob: result.blob, size: result.blob.size }]; d.status = 'done'; });
    } catch (e) {
      updateOp(d => { d.error = e instanceof Error ? e.message : 'Compression failed'; d.status = 'error'; });
    }
  };

  return (
    <div className="space-y-5">
      <Card className="p-4 bg-amber-500/10 border-amber-500/30 text-amber-500 text-sm rounded-xl">
        ⚠️ FFmpeg WASM is ~30MB and loads once. Large videos may take several minutes to process.
      </Card>

      {!file ? (
        <DropZone onFiles={addFile} accept="video/*" multiple={false} label="Drop a video file" sublabel="MP4, WebM, AVI, MOV supported" />
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
          <div>
            <Label>Quality preset</Label>
            <div className="grid grid-cols-3 gap-2">
              {(['high', 'medium', 'low'] as VideoQuality[]).map(q => (
                <Button
                  key={q}
                  variant="outline"
                  onClick={() => setQuality(q)}
                  className={`transition-all ${quality === q ? 'border-brand-500 bg-brand-500/10 text-brand-400' : 'text-muted-foreground'}`}
                >
                  {q === 'high' ? 'High' : q === 'medium' ? 'Medium' : 'Low'}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {quality === 'high' ? 'Best quality, larger file' : quality === 'medium' ? 'Good balance of quality and size' : 'Smallest file, reduced quality'}
            </p>
          </div>

          {(status === 'loading' || status === 'processing') && (
            <div className="space-y-2">
              <ProgressBar progress={progress} label={log || 'Processing...'} />
            </div>
          )}

          {status === 'error' && <p className="text-sm text-red-500 bg-red-500/10 px-4 py-3 rounded-xl">{error}</p>}

          <Button onClick={compress} disabled={status === 'loading' || status === 'processing'} >
            {status === 'loading' ? 'Loading FFmpeg...' : status === 'processing' ? 'Compressing...' : 'Compress Video'}
          </Button>
        </Card>
      )}

      {output.length > 0 && <OutputFiles files={output} />}
    </div>
  );
}
