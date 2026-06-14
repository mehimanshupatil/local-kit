import { Card } from '@/components/ui/card';
import { useState, useRef, useEffect, type RefObject } from 'react';
import { useDisclosure } from '@mantine/hooks';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PlayIcon, PauseIcon, SkipBackIcon, SkipForwardIcon, ScissorsIcon } from '@phosphor-icons/react';
import ProgressBar from '@/components/shared/ProgressBar';
import { fmtTime } from '@/lib/utils/timeFormat';
import type { ToolStatus } from '@/lib/utils/toolState';

interface Props {
  mediaRef: RefObject<HTMLVideoElement | HTMLAudioElement | null>;
  mediaURL: string;
  status: ToolStatus;
  progress: number;
  error: string;
  progressLabel: string;
  onTrim: (start: number, end: number) => void;
  onClear: () => void;
}

export default function MediaTrimmer({
  mediaRef, mediaURL, status, progress, error, progressLabel, onTrim, onClear,
}: Props) {
  const [duration,     setDuration]    = useState(0);
  const [range,        setRange]       = useState<[number, number]>([0, 0]);
  const [currentTime,  setCurrentTime] = useState(0);
  const [playing, { open: startPlaying, close: stopPlaying }] = useDisclosure(false);

  const [start, end] = range;
  const trimmedDuration = end - start;
  const currentPct = duration ? (currentTime / duration) * 100 : 0;

  // Reset timeline when a new file is loaded
  useEffect(() => {
    setDuration(0); setRange([0, 0]); setCurrentTime(0); stopPlaying();
  }, [mediaURL]);

  // Wire media events
  useEffect(() => {
    const el = mediaRef.current;
    if (!el || !mediaURL) return;
    const onMetadata = () => { setDuration(el.duration); setRange([0, el.duration]); };
    const onUpdate   = () => setCurrentTime(el.currentTime);
    const onPause    = () => stopPlaying();
    const onBound    = () => { if (el.currentTime >= end) { el.pause(); el.currentTime = end; } };
    el.addEventListener('loadedmetadata', onMetadata);
    el.addEventListener('timeupdate', onUpdate);
    el.addEventListener('timeupdate', onBound);
    el.addEventListener('pause', onPause);
    return () => {
      el.removeEventListener('loadedmetadata', onMetadata);
      el.removeEventListener('timeupdate', onUpdate);
      el.removeEventListener('timeupdate', onBound);
      el.removeEventListener('pause', onPause);
    };
  }, [mediaURL, end]);

  const seekTo = (t: number) => {
    if (!mediaRef.current) return;
    mediaRef.current.currentTime = t;
    setCurrentTime(t);
  };

  const togglePlay = () => {
    const el = mediaRef.current;
    if (!el) return;
    if (playing) { el.pause(); }
    else {
      if (el.currentTime >= end || el.currentTime < start) el.currentTime = start;
      el.play(); startPlaying();
    }
  };

  const onRangeChange = (vals: number|readonly number[]) => {
    const [s, e] = vals as [number, number];
    setRange([s, e]);
    seekTo(s);
  };

  if (duration === 0) return null;

  return (
    <Card className="p-5 space-y-5">
      {/* Timeline */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground font-mono">
          <span>{fmtTime(start)}</span>
          <span className="text-brand-500 font-semibold">
            ✂ {fmtTime(trimmedDuration)} selected
          </span>
          <span>{fmtTime(end)}</span>
        </div>

        <div className="relative px-2">
          <Slider
            min={0} max={duration} step={0.05}
            value={[start, end]}
            onValueChange={onRangeChange}
            minStepsBetweenValues={Math.ceil(0.5 / 0.05)}
            className="**:data-[slot=slider-thumb]:h-7 **:data-[slot=slider-thumb]:w-4 **:data-[slot=slider-thumb]:rounded-sm **:data-[slot=slider-track]:h-2"
          />
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white/80 pointer-events-none z-20"
            style={{ left: `calc(${currentPct}% + 8px)` }}
          >
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 size-2 bg-white rounded-full shadow" />
          </div>
        </div>

        <div className="relative h-4 px-2">
          {Array.from({ length: 9 }, (_, i) => i + 1).map(i => (
            <span key={i}
              className="absolute text-[10px] text-muted-foreground -translate-x-1/2"
              style={{ left: `${(i / 10) * 100}%` }}>
              {fmtTime((i / 10) * duration).split('.')[0]}
            </span>
          ))}
        </div>
      </div>

      {/* Playback controls */}
      <div className="flex items-center gap-3">
        <Button variant="secondary" size="icon" onClick={() => seekTo(start)} title="Jump to start">
          <SkipBackIcon className="size-4" />
        </Button>
        <Button onClick={togglePlay}>
          {playing ? <PauseIcon className="size-5" /> : <PlayIcon className="size-5" />}
        </Button>
        <Button variant="secondary" size="icon" onClick={() => seekTo(end)} title="Jump to end">
          <SkipForwardIcon className="size-4" />
        </Button>
        <span className="flex-1 text-center font-mono text-sm text-muted-foreground">
          {fmtTime(currentTime)} / {fmtTime(duration)}
        </span>
        <div className="flex items-center gap-2 text-xs">
          <div className="text-center">
            <p className="text-muted-foreground mb-0.5">Start (s)</p>
            <Input type="number" step={0.1} min={0} max={end - 0.5}
              value={start.toFixed(1)}
              onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) { setRange([Math.min(v, end - 0.5), end]); seekTo(v); } }}
              className="w-20 font-mono text-xs" />
          </div>
          <div className="text-center">
            <p className="text-muted-foreground mb-0.5">End (s)</p>
            <Input type="number" step={0.1} min={start + 0.5} max={duration}
              value={end.toFixed(1)}
              onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) setRange([start, Math.max(v, start + 0.5)]); }}
              className="w-20 font-mono text-xs" />
          </div>
        </div>
      </div>

      {/* Duration info */}
      <div className="flex gap-3 text-sm">
        <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-secondary">
          <span className="text-muted-foreground">Original</span>
          <span className="font-medium text-foreground">{fmtTime(duration)}</span>
        </div>
        <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-brand-500/10 border border-brand-500/20">
          <span className="text-brand-500">After trim</span>
          <span className="font-medium text-brand-400">{fmtTime(trimmedDuration)}</span>
          <span className="ml-auto text-xs text-brand-500">
            -{Math.round((1 - trimmedDuration / duration) * 100)}%
          </span>
        </div>
      </div>

      {status === 'processing' && <ProgressBar progress={progress} label={progressLabel} />}
      {status === 'error' && (
        <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-4 py-3 rounded-xl">{error}</p>
      )}

      <div className="flex gap-3">
        <Button onClick={() => onTrim(start, end)} disabled={status === 'processing'} size="lg" className="flex-1">
          <ScissorsIcon className="size-4" />
          {status === 'processing' ? 'Trimming…' : `Trim: ${fmtTime(start)} → ${fmtTime(end)}`}
        </Button>
        <Button variant="secondary" onClick={onClear}>Change</Button>
      </div>
    </Card>
  );
}
