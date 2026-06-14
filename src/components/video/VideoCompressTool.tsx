import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FcVideoFile } from 'react-icons/fc';
import { useState, useEffect } from 'react';
import { useImmer } from 'use-immer';
import DropZone from '@/components/shared/DropZone';
import ProgressBar from '@/components/shared/ProgressBar';
import OutputFiles, { type OutputFile } from '@/components/shared/OutputFiles';
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
      <div className="card p-4 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 text-sm rounded-xl">
        ⚠️ FFmpeg WASM is ~30MB and loads once. Large videos may take several minutes to process.
      </div>

      {!file ? (
        <DropZone onFiles={addFile} accept="video/*" multiple={false} label="Drop a video file" sublabel="MP4, WebM, AVI, MOV supported" />
      ) : (
        <div className="flex items-center gap-3 px-4 py-3 card rounded-xl border">
          <FcVideoFile size={28} />
          <div className="flex-1">
            <p className="font-medium text-gray-900 dark:text-gray-100">{file.name}</p>
            <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => { setFile(null); updateOp(() => ({ ...IDLE_OP })); clearSession(); }}>Change</Button>
        </div>
      )}

      {file && (
        <div className="card p-5 space-y-5">
          <div>
            <label className="label">Quality preset</label>
            <div className="grid grid-cols-3 gap-2">
              {(['high', 'medium', 'low'] as VideoQuality[]).map(q => (
                <Button
                  key={q}
                  variant="outline"
                  onClick={() => setQuality(q)}
                  className={`transition-all ${quality === q ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/30 text-brand-700 dark:text-brand-300' : 'text-gray-600 dark:text-gray-400'}`}
                >
                  {q === 'high' ? 'High' : q === 'medium' ? 'Medium' : 'Low'}
                </Button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              {quality === 'high' ? 'Best quality, larger file' : quality === 'medium' ? 'Good balance of quality and size' : 'Smallest file, reduced quality'}
            </p>
          </div>

          {(status === 'loading' || status === 'processing') && (
            <div className="space-y-2">
              <ProgressBar progress={progress} label={log || 'Processing...'} />
            </div>
          )}

          {status === 'error' && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-4 py-3 rounded-xl">{error}</p>}

          <Button onClick={compress} disabled={status === 'loading' || status === 'processing'} >
            {status === 'loading' ? 'Loading FFmpeg...' : status === 'processing' ? 'Compressing...' : 'Compress Video'}
          </Button>
        </div>
      )}

      {output.length > 0 && <OutputFiles files={output} />}
    </div>
  );
}
