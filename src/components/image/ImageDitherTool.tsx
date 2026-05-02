import { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import DropZone from '@/components/shared/DropZone';
import ProgressBar from '@/components/shared/ProgressBar';
import OutputFiles, { type OutputFile } from '@/components/shared/OutputFiles';
import { ditherImage } from '@/lib/image/imageDither';
import type { DitherAlgorithm, DitherOptions, PaletteMode } from '@/lib/image/imageDither';
import { formatFileSize, stripExtension, generateId } from '@/lib/utils/fileUtils';

const ALGORITHM_OPTIONS: { value: DitherAlgorithm; label: string }[] = [
  { value: 'floyd-steinberg', label: 'Floyd-Steinberg' },
  { value: 'atkinson', label: 'Atkinson' },
  { value: 'ordered-2x2', label: 'Ordered 2×2 (Bayer)' },
  { value: 'ordered-4x4', label: 'Ordered 4×4 (Bayer)' },
  { value: 'ordered-8x8', label: 'Ordered 8×8 (Bayer)' },
  { value: 'random', label: 'Random Noise' },
  { value: 'threshold', label: 'Threshold' },
];

const PALETTE_OPTIONS: { value: PaletteMode; label: string }[] = [
  { value: 'bw', label: 'Black & White' },
  { value: 'grayscale-4', label: '4-level Grayscale' },
  { value: 'grayscale-8', label: '8-level Grayscale' },
  { value: 'color-web', label: 'Web-safe 216 colors' },
];

const DEFAULT_OPTS: DitherOptions = {
  algorithm: 'floyd-steinberg',
  palette: 'bw',
  threshold: 128,
  scale: 1.0,
};

function showThreshold(algo: DitherAlgorithm): boolean {
  return algo === 'threshold' || algo.startsWith('ordered-');
}

export default function ImageDitherTool() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [dimensions, setDimensions] = useState<{ w: number; h: number } | null>(null);
  const [opts, setOpts] = useState<DitherOptions>(DEFAULT_OPTS);
  const [status, setStatus] = useState<'idle' | 'processing' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [output, setOutput] = useState<OutputFile[]>([]);
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevFileRef = useRef<File | null>(null);

  function onFiles(files: File[]) {
    const f = files[0];
    if (!f) return;
    // Revoke old preview
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const url = URL.createObjectURL(f);
    setFile(f);
    setPreviewUrl(url);
    setOutput([]);
    setStatus('idle');
    setError('');

    const img = new Image();
    img.onload = () => setDimensions({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = url;
  }

  // Cleanup preview URL on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Debounced auto-process on opts change (500ms)
  useEffect(() => {
    if (!file) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      process(file, opts);
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [opts, file]);

  // Process immediately when file first loaded
  useEffect(() => {
    if (!file) return;
    if (prevFileRef.current === file) return;
    prevFileRef.current = file;
    process(file, opts);
  }, [file]);

  async function process(f: File, options: DitherOptions) {
    setStatus('processing');
    setProgress(0);
    setError('');
    try {
      const blob = await ditherImage(f, options, (pct) => setProgress(pct));
      const outName = `${stripExtension(f.name)}_dither.png`;
      setOutput([{ name: outName, blob, size: blob.size }]);
      setStatus('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Dithering failed');
      setStatus('error');
    }
  }

  function updateOpt<K extends keyof DitherOptions>(key: K, value: DitherOptions[K]) {
    setOpts(prev => ({ ...prev, [key]: value }));
  }

  const outW = dimensions ? Math.round(dimensions.w * opts.scale) : null;
  const outH = dimensions ? Math.round(dimensions.h * opts.scale) : null;

  return (
    <div className="space-y-5">
      <DropZone
        onFiles={onFiles}
        accept="image/*"
        multiple={false}
        label="Drop an image here"
        sublabel="JPEG, PNG, WebP, GIF supported"
      />

      {file && (
        <div className="space-y-5">
          {/* Before / after preview */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardContent className="pt-4 pb-3 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Original</p>
                <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 flex items-center justify-center min-h-48">
                  <img src={previewUrl} alt="Original" className="max-w-full max-h-64 object-contain" />
                </div>
                {dimensions && (
                  <p className="text-xs text-gray-400">{dimensions.w} × {dimensions.h}px — {formatFileSize(file.size)}</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 pb-3 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Dithered preview</p>
                <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 flex items-center justify-center min-h-48">
                  {status === 'processing' ? (
                    <p className="text-xs text-gray-400">Processing…</p>
                  ) : output.length > 0 ? (
                    <img
                      src={URL.createObjectURL(output[0].blob)}
                      alt="Dithered"
                      className="max-w-full max-h-64 object-contain"
                      style={{ imageRendering: 'pixelated' }}
                    />
                  ) : (
                    <p className="text-xs text-gray-400 select-none">Preview will appear here</p>
                  )}
                </div>
                {outW && outH && (
                  <p className="text-xs text-gray-400">{outW} × {outH}px output</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Options */}
          <Card>
            <CardContent className="pt-5 pb-4 space-y-5">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Options</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Algorithm */}
                <div className="space-y-2">
                  <Label htmlFor="dither-algo">Algorithm</Label>
                  <select
                    id="dither-algo"
                    value={opts.algorithm}
                    onChange={e => updateOpt('algorithm', e.target.value as DitherAlgorithm)}
                    className="input w-full"
                  >
                    {ALGORITHM_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                {/* Palette */}
                <div className="space-y-2">
                  <Label htmlFor="dither-palette">Palette</Label>
                  <select
                    id="dither-palette"
                    value={opts.palette}
                    onChange={e => updateOpt('palette', e.target.value as PaletteMode)}
                    className="input w-full"
                  >
                    {PALETTE_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                {/* Threshold — only shown for threshold/ordered algorithms */}
                {showThreshold(opts.algorithm) && (
                  <div className="space-y-2">
                    <Label>Threshold: {opts.threshold}</Label>
                    <Slider
                      min={0}
                      max={255}
                      step={1}
                      value={[opts.threshold]}
                      onValueChange={([v]) => updateOpt('threshold', v)}
                    />
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>0</span><span>255</span>
                    </div>
                  </div>
                )}

                {/* Scale */}
                <div className="space-y-2">
                  <Label>Scale: {opts.scale.toFixed(2)}×</Label>
                  <Slider
                    min={0.25}
                    max={2.0}
                    step={0.25}
                    value={[opts.scale]}
                    onValueChange={([v]) => updateOpt('scale', v)}
                  />
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>0.25×</span><span>2×</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {status === 'processing' && (
            <ProgressBar progress={progress} label="Applying dithering…" />
          )}
          {status === 'error' && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-4 py-3 rounded-xl">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <Button
              onClick={() => file && process(file, opts)}
              disabled={status === 'processing'}
            >
              {status === 'processing' ? 'Processing…' : 'Apply Dithering'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                URL.revokeObjectURL(previewUrl);
                setFile(null);
                setPreviewUrl('');
                setDimensions(null);
                setOutput([]);
                setStatus('idle');
                setError('');
                prevFileRef.current = null;
              }}
            >
              Reset
            </Button>
          </div>
        </div>
      )}

      {output.length > 0 && <OutputFiles files={output} />}
    </div>
  );
}
