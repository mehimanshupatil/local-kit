import { useState, useRef, useEffect, useCallback } from 'react';
import { useImmer } from 'use-immer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import DropZone from '@/components/shared/DropZone';
import OutputFiles from '@/components/shared/OutputFiles';
import { applyWatermark, drawWatermarkOnCanvas, type WatermarkOptions, type WatermarkPosition } from '@/lib/image/imageWatermark';
import { formatFileSize, stripExtension, getExtension } from '@/lib/utils/fileUtils';
import { useToolPrefs } from '@/stores/prefsStore';
import { useToolVisit } from '@/stores/toolVisit';
import { cn } from '@/lib/utils/cn';
import { type ToolOp, IDLE_OP } from '@/lib/utils/toolState';

// ---- Position grid ----

const POSITION_GRID: WatermarkPosition[][] = [
  ['tl', 'tc', 'tr'],
  ['ml', 'mc', 'mr'],
  ['bl', 'bc', 'br'],
];

const POSITION_LABELS: Record<WatermarkPosition, string> = {
  tl: 'TL', tc: 'TC', tr: 'TR',
  ml: 'ML', mc: 'MC', mr: 'MR',
  bl: 'BL', bc: 'BC', br: 'BR',
};

// ---- Rotation presets ----

const ROTATION_PRESETS = [
  { label: '0°',   value: 0 },
  { label: '45°',  value: 45 },
  { label: '-45°', value: -45 },
  { label: '-90°', value: -90 },
] as const;

const PREVIEW_MAX_W = 400;

export default function ImageWatermarkTool() {
  useToolVisit('image', '/image/watermark');

  const [prefs, updatePrefs] = useToolPrefs('/image/watermark', {
    text: '© Copyright' as string,
    fontSize: 32 as number,
    color: '#ffffff' as string,
    opacity: 60 as number,
    position: 'br' as WatermarkPosition,
    rotation: 0 as number,
    padding: 20 as number,
    repeat: false as boolean,
  });

  const [file, setFile]           = useState<File | null>(null);
  const [imgEl, setImgEl]         = useState<HTMLImageElement | null>(null);
  const [op, updateOp]            = useImmer<ToolOp>({ ...IDLE_OP });
  const { status, output, error } = op;

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // ---- Draw preview onto canvas ----

  const drawPreview = useCallback(() => {
    if (!imgEl || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const scale = Math.min(1, PREVIEW_MAX_W / imgEl.naturalWidth);
    canvas.width  = Math.round(imgEl.naturalWidth  * scale);
    canvas.height = Math.round(imgEl.naturalHeight * scale);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imgEl, 0, 0, canvas.width, canvas.height);

    if (prefs.text.trim()) {
      drawWatermarkOnCanvas(ctx, canvas.width, canvas.height, scale, prefs);
    }
  }, [imgEl, prefs]);

  useEffect(() => { drawPreview(); }, [drawPreview]);

  // ---- File handling ----

  const handleFiles = (files: File[]) => {
    const img = files.find(f => f.type.startsWith('image/'));
    if (!img) return;

    const url = URL.createObjectURL(img);
    const el = new Image();
    el.onload = () => {
      URL.revokeObjectURL(url);
      setImgEl(el);
      setFile(img);
      updateOp(() => ({ ...IDLE_OP }));
    };
    el.onerror = () => URL.revokeObjectURL(url);
    el.src = url;
  };

  const handleChange = () => {
    setFile(null);
    setImgEl(null);
    updateOp(() => ({ ...IDLE_OP }));
  };

  // ---- Apply + download ----

  const handleApply = async () => {
    if (!file || !prefs.text.trim()) return;
    updateOp(d => { d.status = 'processing'; d.error = ''; });
    try {
      const blob = await applyWatermark(file, prefs);
      const ext  = getExtension(file.name) || 'png';
      const name = `${stripExtension(file.name)}_watermarked.${ext}`;
      updateOp(d => { d.output = [{ name, blob, size: blob.size }]; d.status = 'done'; });
    } catch (e) {
      updateOp(d => { d.error = e instanceof Error ? e.message : 'Processing failed'; d.status = 'error'; });
    }
  };

  // ---- No file yet ----

  if (!file) {
    return (
      <div className="space-y-5">
        <DropZone
          onFiles={handleFiles}
          accept="image/*"
          multiple={false}
          label="Drop an image"
          sublabel="JPG, PNG, WebP supported"
        />
      </div>
    );
  }

  // ---- Tool UI ----

  return (
    <div className="space-y-5">

      {/* File info bar */}
      <Card className="p-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
          <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
        </div>
        <Button variant="secondary" size="sm" className="shrink-0" onClick={handleChange}>
          Change
        </Button>
      </Card>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* LEFT — Live preview */}
        <Card className="p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Preview</h3>
          <div className="overflow-auto rounded-xl bg-secondary flex items-center justify-center p-2 min-h-[180px]">
            <canvas
              ref={canvasRef}
              className="max-w-full rounded block"
              style={{ imageRendering: 'auto' }}
            />
          </div>
        </Card>

        {/* RIGHT — Controls */}
        <div className="space-y-4 flex flex-col">

          <Card>
            <CardContent className="pt-5 space-y-5">

              {/* Text */}
              <div className="space-y-1.5">
                <Label>Watermark text</Label>
                <Input
                  value={prefs.text}
                  onChange={e => updatePrefs({ text: e.target.value })}
                  placeholder="e.g. © Copyright"
                />
              </div>

              {/* Font size */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label>Font size</Label>
                  <span className="text-sm font-mono text-muted-foreground">{prefs.fontSize}px</span>
                </div>
                <Slider
                  min={12}
                  max={120}
                  step={1}
                  value={prefs.fontSize}
                  onValueChange={v => updatePrefs({ fontSize: Array.isArray(v) ? v[0] : v })}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>12px</span>
                  <span>120px</span>
                </div>
              </div>

              {/* Color + Opacity row */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Color</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={prefs.color}
                      onChange={e => updatePrefs({ color: e.target.value })}
                      className="w-9 h-9 rounded cursor-pointer border border-border bg-background p-0.5"
                      title="Pick watermark color"
                    />
                    <span className="text-xs font-mono text-muted-foreground uppercase">{prefs.color}</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <Label>Opacity</Label>
                    <span className="text-sm font-mono text-muted-foreground">{prefs.opacity}%</span>
                  </div>
                  <Slider
                    min={5}
                    max={100}
                    step={1}
                    value={prefs.opacity}
                    onValueChange={v => updatePrefs({ opacity: Array.isArray(v) ? v[0] : v })}
                  />
                </div>
              </div>

              {/* Position grid */}
              <div className="space-y-1.5">
                <Label>Position</Label>
                <div className="inline-grid grid-cols-3 gap-1">
                  {POSITION_GRID.map((row, ri) =>
                    row.map(pos => (
                      <Button
                        key={pos}
                        variant="outline"
                        size="sm"
                        onClick={() => updatePrefs({ position: pos })}
                        className={cn(
                          'w-10 h-10 text-xs font-mono transition-all',
                          prefs.position === pos
                            ? 'border-brand-500 bg-brand-500/10 text-brand-400'
                            : 'text-muted-foreground',
                        )}
                        title={POSITION_LABELS[pos]}
                      >
                        {POSITION_LABELS[pos]}
                      </Button>
                    ))
                  )}
                </div>
              </div>

              {/* Rotation presets */}
              <div className="space-y-1.5">
                <Label>Rotation</Label>
                <div className="flex gap-2">
                  {ROTATION_PRESETS.map(preset => (
                    <Button
                      key={preset.value}
                      variant="outline"
                      size="sm"
                      onClick={() => updatePrefs({ rotation: preset.value })}
                      className={cn(
                        'flex-1 transition-all',
                        prefs.rotation === preset.value
                          ? 'border-brand-500 bg-brand-500/10 text-brand-400'
                          : 'text-muted-foreground',
                      )}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Repeat toggle */}
              <div className="flex items-center justify-between pt-1">
                <div>
                  <p className="text-sm font-medium text-foreground">Tile / Repeat</p>
                  <p className="text-xs text-muted-foreground">Cover the entire image with the watermark</p>
                </div>
                <Button
                  variant={prefs.repeat ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => updatePrefs({ repeat: !prefs.repeat })}
                  className={prefs.repeat ? 'bg-brand-500 text-black hover:bg-brand-400' : ''}
                >
                  {prefs.repeat ? 'On' : 'Off'}
                </Button>
              </div>

            </CardContent>
          </Card>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Error */}
          {status === 'error' && (
            <p className="text-sm text-red-500 bg-red-500/10 px-4 py-3 rounded-xl">
              {error}
            </p>
          )}

          {/* Apply */}
          <Button
            onClick={handleApply}
            disabled={!prefs.text.trim() || status === 'processing'}
            size="lg"
            className="w-full"
          >
            {status === 'processing' ? 'Applying…' : 'Download with Watermark'}
          </Button>
        </div>
      </div>

      {/* Output */}
      <OutputFiles files={output} />
    </div>
  );
}
