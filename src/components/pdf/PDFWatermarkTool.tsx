import { useState, useEffect, useRef } from 'react';
import { useImmer } from 'use-immer';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToolPrefs } from '@/stores/prefsStore';
import { useToolVisit } from '@/stores/toolVisit';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import DropZone from '@/components/shared/DropZone';
import ProgressBar from '@/components/shared/ProgressBar';
import OutputFiles from '@/components/shared/OutputFiles';
import { watermarkPDF, measureWatermark, watermarkPlacements } from '@/lib/pdf/pdfWatermark';
import { loadPDFDocument } from '@/lib/pdf/pdfLoader';
import { renderPageToCanvas } from '@/lib/pdf/pdfAnnotate';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react';
import { stripExtension } from '@/lib/utils/fileUtils';
import { cn } from '@/lib/utils/cn';
import PDFFileBar from './PDFFileBar';
import { type ToolOp, IDLE_OP } from '@/lib/utils/toolState';

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
  const { sessionFiles, setSessionFiles, clearSession } = useToolVisit('pdf', '/pdf/watermark');
  const [file,     setFile]     = useState<{ name: string; size: number; buffer: ArrayBuffer } | null>(null);
  const [prefs, updatePrefs] = useToolPrefs('/pdf/watermark', {
    text: 'CONFIDENTIAL' as string,
    fontSize: 60,
    opacity: 25,
    rotation: 'diagonal' as RotationPreset,
    color: 'gray' as ColorKey,
    repeat: false,
    gap: 60,
  });
  const { text, fontSize, opacity, rotation, color, repeat, gap } = prefs;
  const setText = (v: string) => updatePrefs({ text: v });
  const setFontSize = (v: number) => updatePrefs({ fontSize: v });
  const setOpacity = (v: number) => updatePrefs({ opacity: v });
  const setRotation = (v: RotationPreset) => updatePrefs({ rotation: v });
  const setColor = (v: ColorKey) => updatePrefs({ color: v });
  const setRepeat = (v: boolean) => updatePrefs({ repeat: v });
  const setGap = (v: number) => updatePrefs({ gap: v });
  const repeatOpt = repeat ? { gap } : undefined;
  const [op, updateOp] = useImmer<ToolOp>({ ...IDLE_OP });
  const { status, progress, output, error } = op;
  const rotationDeg = ROTATION_PRESETS.find(r => r.key === rotation)!.degrees;

  // Live preview: the page is rendered once per page change; the watermark is redrawn on a
  // canvas layered on top using the same placement maths and font metrics as the export.
  const [pdf, setPdf]                 = useState<PDFDocumentProxy | null>(null);
  const [previewPage, setPreviewPage] = useState(1);
  const [view, setView]               = useState<{ scale: number; pageW: number; pageH: number } | null>(null);
  const pageCanvasRef    = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!pdf || !pageCanvasRef.current) return;
    let cancel = false;
    renderPageToCanvas(pdf, previewPage, pageCanvasRef.current, 560).then(({ scale, dims }) => {
      if (!cancel) setView({ scale, pageW: dims.width, pageH: dims.height });
    });
    return () => { cancel = true; };
  }, [pdf, previewPage]);

  useEffect(() => {
    const overlay = overlayCanvasRef.current, page = pageCanvasRef.current;
    if (!overlay || !page || !view) return;
    overlay.width = page.width; overlay.height = page.height;
    const ctx = overlay.getContext('2d')!;
    const t = text.trim();
    if (!t) return;

    const s = view.scale;
    const size = measureWatermark(t, fontSize);
    const origins = watermarkPlacements({ width: view.pageW, height: view.pageH }, size, rotationDeg, repeatOpt);
    const [r, g, b] = COLOR_MAP[color];
    ctx.font = `bold ${fontSize * s}px Helvetica, Arial, sans-serif`;
    // Stretch the browser's font to Helvetica-Bold's exact width so the preview matches the export
    const measured = ctx.measureText(t).width;
    ctx.globalAlpha = opacity / 100;
    ctx.fillStyle = `rgb(${r * 255}, ${g * 255}, ${b * 255})`;
    for (const origin of origins) {
      ctx.save();
      ctx.translate(origin.x * s, (view.pageH - origin.y) * s); // PDF y-up → canvas y-down
      ctx.rotate((-rotationDeg * Math.PI) / 180);
      if (measured > 0) ctx.scale((size.width * s) / measured, 1);
      ctx.fillText(t, 0, 0);
      ctx.restore();
    }
  }, [view, text, fontSize, opacity, rotationDeg, color, repeat, gap]);

  useEffect(() => {
    if (sessionFiles.length > 0 && !file) {
      try { addFile([sessionFiles[0]]); } catch {}
    }
  }, []);

  const addFile = async ([f]: File[]) => {
    const buf = await f.arrayBuffer();
    setFile({ name: f.name, size: f.size, buffer: buf });
    setPreviewPage(1); setView(null);
    // slice: pdf.js transfers the buffer it is given, and the export still needs the original
    loadPDFDocument(buf.slice(0)).then(setPdf, () => setPdf(null));
    setSessionFiles([f]);
    updateOp(() => ({ ...IDLE_OP }));
  };

  const apply = async () => {
    if (!file || !text.trim()) return;
    updateOp(d => { d.status = 'processing'; d.progress = 0; d.error = ''; });
    try {
      const blob = await watermarkPDF(
        file.buffer,
        {
          text: text.trim(),
          fontSize,
          opacity: opacity / 100,
          color: COLOR_MAP[color],
          rotation: rotationDeg,
          repeat: repeatOpt,
        },
        pct => updateOp(d => { d.progress = pct; }),
      );
      updateOp(d => { d.output = [{ name: `${stripExtension(file.name)}_watermarked.pdf`, blob, size: blob.size }]; d.status = 'done'; });
    } catch (e) {
      updateOp(d => { d.error = e instanceof Error ? e.message : 'Failed to apply watermark'; d.status = 'error'; });
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
        <PDFFileBar file={file} total={pdf?.numPages} onClear={() => { setFile(null); setPdf(null); setView(null); updateOp(() => ({ ...IDLE_OP })); clearSession(); }} />
      )}

      {file && (
        <div className="grid gap-5 lg:grid-cols-2 items-start">
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
                value={fontSize}
                onValueChange={(v) => setFontSize(Array.isArray(v) ? v[0] : v)}
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
                value={opacity}
                onValueChange={(v) => setOpacity(Array.isArray(v) ? v[0] : v)}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>5%</span>
                <span>80%</span>
              </div>
            </div>

            {/* Rotation presets */}
            <div className="space-y-1.5">
              <Label>Rotation</Label>
              <div className="flex flex-wrap gap-2">
                {ROTATION_PRESETS.map(preset => (
                  <Button
                    key={preset.key}
                    variant="outline"
                    onClick={() => setRotation(preset.key)}
                    className={cn(
                      'flex-1 min-w-fit transition-all',
                      rotation === preset.key
                        ? 'border-brand-500 bg-brand-500/10 text-brand-400'
                        : 'text-muted-foreground'
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
              <div className="flex flex-wrap gap-2">
                {(Object.keys(COLOR_MAP) as ColorKey[]).map(key => (
                  <Button
                    key={key}
                    variant="outline"
                    onClick={() => setColor(key)}
                    className={cn(
                      'flex-1 min-w-fit transition-all',
                      color === key
                        ? 'border-brand-500 bg-brand-500/10 text-brand-400'
                        : 'text-muted-foreground'
                    )}
                  >
                    <span className={cn('size-3 rounded-full shrink-0', COLOR_SWATCHES[key])} />
                    {COLOR_LABELS[key]}
                  </Button>
                ))}
              </div>
            </div>

            {/* Repeat */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox id="watermark-repeat" checked={repeat} onCheckedChange={setRepeat} />
                <Label htmlFor="watermark-repeat" className="cursor-pointer">Repeat across page</Label>
              </div>
              {repeat && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label>Spacing</Label>
                    <span className="text-sm font-mono text-muted-foreground">{gap}pt</span>
                  </div>
                  <Slider min={10} max={200} step={5} value={gap}
                    onValueChange={(v) => setGap(Array.isArray(v) ? v[0] : v)} />
                  <p className="text-xs text-muted-foreground">Harder to crop or cover — tip: smaller text (24–36pt) tiles best.</p>
                </div>
              )}
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

        <Card className="order-first lg:order-none lg:sticky lg:top-4">
          <CardContent className="pt-5 space-y-3">
            <div className="flex items-center justify-between">
              <Label>Preview</Label>
              {pdf && pdf.numPages > 1 && (
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="size-7" aria-label="Previous page"
                    onClick={() => setPreviewPage(p => p - 1)} disabled={previewPage <= 1}>
                    <CaretLeftIcon className="size-4" />
                  </Button>
                  <span className="text-xs text-muted-foreground tabular-nums">Page {previewPage} / {pdf.numPages}</span>
                  <Button variant="ghost" size="icon" className="size-7" aria-label="Next page"
                    onClick={() => setPreviewPage(p => p + 1)} disabled={previewPage >= pdf.numPages}>
                    <CaretRightIcon className="size-4" />
                  </Button>
                </div>
              )}
            </div>
            <div className="relative mx-auto w-fit max-w-full rounded-md overflow-hidden border border-border bg-white">
              <canvas ref={pageCanvasRef} className="block max-w-full h-auto" />
              <canvas ref={overlayCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" aria-label="Watermark preview" />
              {!view && <p className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">Rendering page…</p>}
            </div>
          </CardContent>
        </Card>
        </div>
      )}

      {output.length > 0 && <OutputFiles files={output} />}
    </div>
  );
}
