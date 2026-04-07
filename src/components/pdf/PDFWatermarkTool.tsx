import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import DropZone from '@/components/shared/DropZone';
import ProgressBar from '@/components/shared/ProgressBar';
import OutputFiles, { type OutputFile } from '@/components/shared/OutputFiles';
import { watermarkPDF } from '@/lib/pdf/pdfWatermark';
import { formatFileSize, stripExtension } from '@/lib/utils/fileUtils';
import { cn } from '@/lib/utils/cn';

type ColorKey = 'gray' | 'red' | 'blue' | 'green';
type RotationPreset = 'diagonal' | 'horizontal' | 'vertical';

const COLOR_MAP: Record<ColorKey, [number, number, number]> = {
  gray:  [0.5, 0.5, 0.5],
  red:   [0.8, 0.1, 0.1],
  blue:  [0.1, 0.2, 0.8],
  green: [0.1, 0.6, 0.1],
};

const COLOR_LABELS: Record<ColorKey, string> = {
  gray:  'Gray',
  red:   'Red',
  blue:  'Blue',
  green: 'Green',
};

const COLOR_SWATCHES: Record<ColorKey, string> = {
  gray:  'bg-gray-400',
  red:   'bg-red-600',
  blue:  'bg-blue-700',
  green: 'bg-green-600',
};

const ROTATION_PRESETS: { key: RotationPreset; label: string; degrees: number }[] = [
  { key: 'diagonal',   label: 'Diagonal',   degrees: 45  },
  { key: 'horizontal', label: 'Horizontal', degrees: 0   },
  { key: 'vertical',   label: 'Vertical',   degrees: 90  },
];

export default function PDFWatermarkTool() {
  const [file,     setFile]     = useState<{ name: string; size: number; buffer: ArrayBuffer } | null>(null);
  const [text,     setText]     = useState('CONFIDENTIAL');
  const [fontSize, setFontSize] = useState(60);
  const [opacity,  setOpacity]  = useState(25);
  const [rotation, setRotation] = useState<RotationPreset>('diagonal');
  const [color,    setColor]    = useState<ColorKey>('gray');
  const [status,   setStatus]   = useState<'idle' | 'processing' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [output,   setOutput]   = useState<OutputFile[]>([]);
  const [error,    setError]    = useState('');

  const addFile = async ([f]: File[]) => {
    const buf = await f.arrayBuffer();
    setFile({ name: f.name, size: f.size, buffer: buf });
    setStatus('idle'); setOutput([]);
  };

  const apply = async () => {
    if (!file || !text.trim()) return;
    setStatus('processing'); setProgress(0); setError('');
    try {
      const blob = await watermarkPDF(
        file.buffer,
        {
          text: text.trim(),
          fontSize,
          opacity: opacity / 100,
          color: COLOR_MAP[color],
          rotation: ROTATION_PRESETS.find(r => r.key === rotation)!.degrees,
        },
        setProgress,
      );
      setOutput([{ name: `${stripExtension(file.name)}_watermarked.pdf`, blob, size: blob.size }]);
      setStatus('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to apply watermark');
      setStatus('error');
    }
  };

  return (
    <div className="space-y-5">
      {!file ? (
        <DropZone
          onFiles={addFile}
          accept=".pdf,application/pdf"
          multiple={false}
          label="Drop a PDF file"
          sublabel="Add a watermark text to every page"
        />
      ) : (
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <span className="text-2xl">📄</span>
            <div className="flex-1">
              <p className="font-medium text-gray-900 dark:text-gray-100">{file.name}</p>
              <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => { setFile(null); setOutput([]); setStatus('idle'); }}>
              Change
            </Button>
          </CardContent>
        </Card>
      )}

      {file && (
        <Card>
          <CardContent className="pt-5 space-y-5">

            {/* Watermark text */}
            <div className="space-y-1.5">
              <Label>Watermark text</Label>
              <Input
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="e.g. CONFIDENTIAL"
              />
            </div>

            {/* Font size */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label>Font size</Label>
                <span className="text-sm font-mono text-muted-foreground">{fontSize}pt</span>
              </div>
              <Slider
                min={20}
                max={120}
                step={1}
                value={[fontSize]}
                onValueChange={([v]) => setFontSize(v)}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>20pt</span>
                <span>120pt</span>
              </div>
            </div>

            {/* Opacity */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label>Opacity</Label>
                <span className="text-sm font-mono text-muted-foreground">{opacity}%</span>
              </div>
              <Slider
                min={5}
                max={80}
                step={1}
                value={[opacity]}
                onValueChange={([v]) => setOpacity(v)}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>5%</span>
                <span>80%</span>
              </div>
            </div>

            {/* Rotation presets */}
            <div className="space-y-1.5">
              <Label>Rotation</Label>
              <div className="flex gap-2">
                {ROTATION_PRESETS.map(preset => (
                  <Button
                    key={preset.key}
                    onClick={() => setRotation(preset.key)}
                    className={cn(
                      'flex-1 py-2 px-3 text-sm rounded-xl border-2 font-medium transition-all',
                      rotation === preset.key
                        ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/30 text-brand-700 dark:text-brand-300'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                    )}
                  >
                    {preset.label}
                    <span className="ml-1 text-xs text-muted-foreground">{preset.degrees}°</span>
                  </Button>
                ))}
              </div>
            </div>

            {/* Color picker */}
            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex gap-2">
                {(Object.keys(COLOR_MAP) as ColorKey[]).map(key => (
                  <Button
                    key={key}
                    onClick={() => setColor(key)}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-2 py-2 px-3 text-sm rounded-xl border-2 font-medium transition-all',
                      color === key
                        ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/30 text-brand-700 dark:text-brand-300'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                    )}
                  >
                    <span className={cn('w-3 h-3 rounded-full shrink-0', COLOR_SWATCHES[key])} />
                    {COLOR_LABELS[key]}
                  </Button>
                ))}
              </div>
            </div>

            {status === 'processing' && <ProgressBar progress={progress} label="Applying watermark..." />}
            {status === 'error' && (
              <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-4 py-3 rounded-xl">
                {error}
              </p>
            )}

            <Button onClick={apply} disabled={!text.trim() || status === 'processing'} className="w-full">
              {status === 'processing' ? 'Applying…' : 'Apply Watermark'}
            </Button>
          </CardContent>
        </Card>
      )}

      {output.length > 0 && <OutputFiles files={output} />}
    </div>
  );
}
