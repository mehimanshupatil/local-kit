import { useState, useRef, useEffect } from 'react';
import { useImmer } from 'use-immer';
import DropZone from '@/components/shared/DropZone';
import OutputFiles from '@/components/shared/OutputFiles';
import MediaTrimmer from '@/components/shared/MediaTrimmer';
import { trimVideo } from '@/lib/video/videoTrim';
import { type ToolOp, IDLE_OP } from '@/lib/utils/toolState';
import { useToolVisit } from '@/stores/toolVisit';

export default function VideoTrimTool() {
  const { sessionFiles, setSessionFiles, clearSession } = useToolVisit('video', '/video/trim');

  const [file,     setFile]     = useState<File | null>(null);
  const [videoURL, setVideoURL] = useState('');
  const [op, updateOp] = useImmer<ToolOp>({ ...IDLE_OP });
  const { status, progress, output, error } = op;

  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => { if (sessionFiles.length > 0 && !file) addFile([sessionFiles[0]]); }, []);

  const addFile = ([f]: File[]) => {
    if (videoURL) URL.revokeObjectURL(videoURL);
    setFile(f); setVideoURL(URL.createObjectURL(f));
    updateOp(() => ({ ...IDLE_OP }));
    setSessionFiles([f]);
  };

  const trim = async (start: number, end: number) => {
    if (!file) return;
    updateOp(d => { d.status = 'processing'; d.progress = 0; d.error = ''; });
    try {
      const result = await trimVideo(file, start, end, pct => updateOp(d => { d.progress = pct; }));
      updateOp(d => { d.output = [{ name: result.name, blob: result.blob, size: result.blob.size }]; d.status = 'done'; });
    } catch (e) {
      updateOp(d => { d.error = e instanceof Error ? e.message : 'Trim failed'; d.status = 'error'; });
    }
  };

  const clear = () => {
    if (videoURL) URL.revokeObjectURL(videoURL);
    setFile(null); setVideoURL(''); updateOp(() => ({ ...IDLE_OP })); clearSession();
  };

  return (
    <div className="space-y-5">
      {!file ? (
        <DropZone onFiles={addFile} accept="video/*" multiple={false}
          label="Drop a video file" sublabel="MP4, WebM, MOV, AVI supported" />
      ) : (
        <>
          <div className="card overflow-hidden rounded-2xl bg-black">
            <video ref={videoRef} src={videoURL}
              className="w-full max-h-[400px] object-contain" preload="metadata" />
          </div>
          <MediaTrimmer
            mediaRef={videoRef} mediaURL={videoURL}
            status={status} progress={progress} error={error}
            progressLabel="Trimming with FFmpeg…"
            onTrim={trim} onClear={clear}
          />
        </>
      )}
      {output.length > 0 && <OutputFiles files={output} />}
    </div>
  );
}
