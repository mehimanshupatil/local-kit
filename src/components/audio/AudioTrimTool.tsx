import { Button } from '@/components/ui/button';
import { useState, useRef, useEffect } from 'react';
import { Slider } from '@/components/ui/slider';
import { Play, Pause, SkipBack, SkipForward, Scissors } from 'lucide-react';
import DropZone from '@/components/shared/DropZone';
import ProgressBar from '@/components/shared/ProgressBar';
import OutputFiles, { type OutputFile } from '@/components/shared/OutputFiles';
import { trimAudio } from '@/lib/audio/audioTrim';
import { formatFileSize } from '@/lib/utils/fileUtils';

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 10);
  return `${m}:${s.toString().padStart(2, '0')}.${ms}`;
}

export default function AudioTrimTool() {
  const [file,        setFile]        = useState<File | null>(null);
  const [audioURL,    setAudioURL]    = useState('');
  const [duration,    setDuration]    = useState(0);
  const [range,       setRange]       = useState<[number, number]>([0, 0]);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing,     setPlaying]     = useState(false);
  const [status,      setStatus]      = useState<'idle' | 'processing' | 'done' | 'error'>('idle');
  const [progress,    setProgress]    = useState(0);
  const [output,      setOutput]      = useState<OutputFile[]>([]);
  const [error,       setError]       = useState('');
  const [trimmedUrl,  setTrimmedUrl]  = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const [start, end] = range;

  const addFile = ([f]: File[]) => {
    if (audioURL) URL.revokeObjectURL(audioURL);
    if (trimmedUrl) { URL.revokeObjectURL(trimmedUrl); setTrimmedUrl(null); }
    const url = URL.createObjectURL(f);
    setFile(f); setAudioURL(url); setStatus('idle'); setOutput([]);
    setPlaying(false); setCurrentTime(0); setRange([0, 0]); setDuration(0);
  };

  const onMetadata = () => {
    const a = audioRef.current;
    if (!a) return;
    setDuration(a.duration);
    setRange([0, a.duration]);
  };

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onUpdate = () => setCurrentTime(a.currentTime);
    const onPause  = () => setPlaying(false);
    const onBound  = () => { if (a.currentTime >= end) { a.pause(); a.currentTime = end; } };
    a.addEventListener('timeupdate', onUpdate);
    a.addEventListener('timeupdate', onBound);
    a.addEventListener('pause', onPause);
    return () => {
      a.removeEventListener('timeupdate', onUpdate);
      a.removeEventListener('timeupdate', onBound);
      a.removeEventListener('pause', onPause);
    };
  }, [audioURL, end]);

  useEffect(() => {
    return () => { if (trimmedUrl) URL.revokeObjectURL(trimmedUrl); };
  }, [trimmedUrl]);

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); }
    else {
      if (a.currentTime >= end || a.currentTime < start) a.currentTime = start;
      a.play(); setPlaying(true);
    }
  };

  const seekTo = (t: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = t;
    setCurrentTime(t);
  };

  const onRangeChange = (vals: number[]) => {
    const [s, e] = vals as [number, number];
    setRange([s, e]);
    seekTo(s);
  };

  const trim = async () => {
    if (!file) return;
    setStatus('processing'); setProgress(0); setError('');
    try {
      const result = await trimAudio(file, start, end, setProgress);
      setOutput([{ name: result.name, blob: result.blob, size: result.blob.size }]);
      if (trimmedUrl) URL.revokeObjectURL(trimmedUrl);
      setTrimmedUrl(URL.createObjectURL(result.blob));
      setStatus('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Trim failed'); setStatus('error');
    }
  };

  const trimmedDuration = end - start;
  const currentPct = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div className="space-y-5">
      {!file ? (
        <DropZone onFiles={addFile} accept="audio/*,.mp3,.aac,.wav,.ogg,.flac,.m4a" multiple={false}
          label="Drop an audio file" sublabel="MP3, AAC, WAV, OGG, FLAC supported" />
      ) : (
        <>
          {/* Audio player */}
          <div className="card p-4">
            <audio
              ref={audioRef}
              src={audioURL}
              onLoadedMetadata={onMetadata}
              className="w-full"
              preload="metadata"
            />
          </div>

          {duration > 0 && (
            <div className="card p-5 space-y-5">

              {/* Timeline */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 font-mono">
                  <span>{fmt(start)}</span>
                  <span className="text-brand-600 dark:text-brand-400 font-semibold">
                    ✂ {fmt(trimmedDuration)} selected
                  </span>
                  <span>{fmt(end)}</span>
                </div>

                <div className="relative px-2">
                  <Slider
                    min={0}
                    max={duration}
                    step={0.05}
                    value={[start, end]}
                    onValueChange={onRangeChange}
                    minStepsBetweenThumbs={Math.ceil(0.5 / 0.05)}
                    className="**:data-[slot=slider-thumb]:h-7 **:data-[slot=slider-thumb]:w-4 **:data-[slot=slider-thumb]:rounded-sm **:data-[slot=slider-track]:h-2"
                  />

                  {/* Playhead */}
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-white/80 pointer-events-none z-20"
                    style={{ left: `calc(${currentPct}% + 8px)` }}
                  >
                    <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white rounded-full shadow" />
                  </div>
                </div>

                {/* Time ticks */}
                <div className="relative h-4 px-2">
                  {Array.from({ length: 9 }, (_, i) => i + 1).map(i => (
                    <span key={i}
                      className="absolute text-[10px] text-gray-500 dark:text-gray-600 -translate-x-1/2"
                      style={{ left: `${(i / 10) * 100}%` }}>
                      {fmt((i / 10) * duration).split('.')[0]}
                    </span>
                  ))}
                </div>
              </div>

              {/* Playback controls */}
              <div className="flex items-center gap-3">
                <Button variant="secondary" size="icon" onClick={() => seekTo(start)} title="Jump to start">
                  <SkipBack className="w-4 h-4" />
                </Button>

                <Button onClick={togglePlay}>
                  {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                </Button>

                <Button variant="secondary" size="icon" onClick={() => seekTo(end)} title="Jump to end">
                  <SkipForward className="w-4 h-4" />
                </Button>

                <span className="flex-1 text-center font-mono text-sm text-gray-600 dark:text-gray-400">
                  {fmt(currentTime)} / {fmt(duration)}
                </span>

                {/* Precise number inputs */}
                <div className="flex items-center gap-2 text-xs">
                  <div className="text-center">
                    <p className="text-gray-400 mb-0.5">Start (s)</p>
                    <input type="number" step={0.1} min={0} max={end - 0.5}
                      value={start.toFixed(1)}
                      onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) { setRange([Math.min(v, end - 0.5), end]); seekTo(v); } }}
                      className="w-20 px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono text-xs" />
                  </div>
                  <div className="text-center">
                    <p className="text-gray-400 mb-0.5">End (s)</p>
                    <input type="number" step={0.1} min={start + 0.5} max={duration}
                      value={end.toFixed(1)}
                      onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) setRange([start, Math.max(v, start + 0.5)]); }}
                      className="w-20 px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono text-xs" />
                  </div>
                </div>
              </div>

              {/* Duration info row */}
              <div className="flex gap-3 text-sm">
                <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800">
                  <span className="text-gray-400">Original</span>
                  <span className="font-medium text-gray-900 dark:text-white">{fmt(duration)}</span>
                </div>
                <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-brand-50 dark:bg-brand-950/30 border border-brand-200 dark:border-brand-900">
                  <span className="text-brand-600 dark:text-brand-400">After trim</span>
                  <span className="font-medium text-brand-700 dark:text-brand-300">{fmt(trimmedDuration)}</span>
                  <span className="ml-auto text-xs text-brand-500">
                    -{Math.round((1 - trimmedDuration / duration) * 100)}%
                  </span>
                </div>
              </div>

              {status === 'processing' && <ProgressBar progress={progress} label="Trimming with FFmpeg..." />}
              {status === 'error' && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-4 py-3 rounded-xl">{error}</p>}

              <div className="flex gap-3">
                <Button onClick={trim} disabled={status === 'processing'} size="lg" className="flex-1">
                  <Scissors className="w-4 h-4" />
                  {status === 'processing' ? 'Trimming...' : `Trim: ${fmt(start)} → ${fmt(end)}`}
                </Button>
                <Button variant="secondary" onClick={() => { if (audioURL) URL.revokeObjectURL(audioURL); setFile(null); setAudioURL(''); setOutput([]); }}>
                  Change
                </Button>
              </div>
            </div>
          )}

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
