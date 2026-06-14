import { useState, useRef, useEffect } from 'react';
import { useImmer } from 'use-immer';
import DropZone from '@/components/shared/DropZone';
import OutputFiles from '@/components/shared/OutputFiles';
import MediaTrimmer from '@/components/shared/MediaTrimmer';
import { trimAudio } from '@/lib/audio/audioTrim';
import { type ToolOp, IDLE_OP } from '@/lib/utils/toolState';
import { useToolVisit } from '@/stores/toolVisit';

export default function AudioTrimTool() {
  const { sessionFiles, setSessionFiles, clearSession } = useToolVisit('audio', '/audio/trim');

  const [file,       setFile]       = useState<File | null>(null);
  const [audioURL,   setAudioURL]   = useState('');
  const [trimmedUrl, setTrimmedUrl] = useState<string | null>(null);
  const [op, updateOp] = useImmer<ToolOp>({ ...IDLE_OP });
  const { status, progress, output, error } = op;

  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => { if (sessionFiles.length > 0 && !file) addFile([sessionFiles[0]]); }, []);
  useEffect(() => { return () => { if (trimmedUrl) URL.revokeObjectURL(trimmedUrl); }; }, [trimmedUrl]);

  const addFile = ([f]: File[]) => {
    if (audioURL) URL.revokeObjectURL(audioURL);
    if (trimmedUrl) { URL.revokeObjectURL(trimmedUrl); setTrimmedUrl(null); }
    setFile(f); setAudioURL(URL.createObjectURL(f));
    updateOp(() => ({ ...IDLE_OP }));
    setSessionFiles([f]);
  };

  const trim = async (start: number, end: number) => {
    if (!file) return;
    updateOp(d => { d.status = 'processing'; d.progress = 0; d.error = ''; });
    try {
      const result = await trimAudio(file, start, end, pct => updateOp(d => { d.progress = pct; }));
      updateOp(d => { d.output = [{ name: result.name, blob: result.blob, size: result.blob.size }]; d.status = 'done'; });
      if (trimmedUrl) URL.revokeObjectURL(trimmedUrl);
      setTrimmedUrl(URL.createObjectURL(result.blob));
    } catch (e) {
      updateOp(d => { d.error = e instanceof Error ? e.message : 'Trim failed'; d.status = 'error'; });
    }
  };

  const clear = () => {
    if (audioURL) URL.revokeObjectURL(audioURL);
    setFile(null); setAudioURL(''); updateOp(() => ({ ...IDLE_OP })); clearSession();
  };

  return (
    <div className="space-y-5">
      {!file ? (
        <DropZone onFiles={addFile} accept="audio/*,.mp3,.aac,.wav,.ogg,.flac,.m4a" multiple={false}
          label="Drop an audio file" sublabel="MP3, AAC, WAV, OGG, FLAC supported" />
      ) : (
        <>
          <div className="card p-4">
            <audio ref={audioRef} src={audioURL} className="w-full" preload="metadata" />
          </div>
          <MediaTrimmer
            mediaRef={audioRef} mediaURL={audioURL}
            status={status} progress={progress} error={error}
            progressLabel="Trimming with FFmpeg…"
            onTrim={trim} onClear={clear}
          />
          {trimmedUrl && (
            <div className="card p-4 space-y-2">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Preview</p>
              <audio src={trimmedUrl} controls className="w-full h-10" />
            </div>
          )}
        </>
      )}
      {output.length > 0 && <OutputFiles files={output} />}
    </div>
  );
}
