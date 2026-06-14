import { useState, useRef, useCallback, useEffect } from 'react';
import { useImmer } from 'use-immer';
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import DropZone from '@/components/shared/DropZone';
import OutputFiles, { type OutputFile } from '@/components/shared/OutputFiles';
import ProgressBar from '@/components/shared/ProgressBar';
import { useToolVisit } from '@/stores/toolVisit';
import { type ToolOp, IDLE_OP } from '@/lib/utils/toolState';
import {
  PASSPORT_STANDARDS, DPI_OPTIONS, getOutputPixels, renderPassportPhoto,
  type PassportStandard, type DpiOption,
} from '@/lib/image/passportPhoto';

export default function PassportPhotoTool() {
  useToolVisit('image', '/image/passport-photo');

  const [file, setFile]       = useState<File | null>(null);
  const [imgSrc, setImgSrc]   = useState('');
  const [crop, setCrop]       = useState<Crop>();
  const [completed, setCompleted] = useState<PixelCrop>();
  const [standard, setStandard]   = useState<PassportStandard>(PASSPORT_STANDARDS[0]);
  const [dpi, setDpi]         = useState<DpiOption>(300);
  const [removeBg, setRemoveBg] = useState(false);
  const [op, updateOp]        = useImmer<ToolOp>({ ...IDLE_OP });
  const { status, progress, output, error } = op;

  const imgRef = useRef<HTMLImageElement>(null);

  const initCrop = useCallback((img: HTMLImageElement) => {
    const aspect = standard.widthMm / standard.heightMm;
    const c = centerCrop(
      makeAspectCrop({ unit: '%', width: 80 }, aspect, img.width, img.height),
      img.width, img.height,
    );
    setCrop(c);
  }, [standard]);

  // Reset crop when standard changes
  useEffect(() => {
    if (imgRef.current) initCrop(imgRef.current);
  }, [standard, initCrop]);

  function handleFiles([f]: File[]) {
    if (!f) return;
    if (imgSrc) URL.revokeObjectURL(imgSrc);
    setFile(f);
    setImgSrc(URL.createObjectURL(f));
    setCrop(undefined);
    setCompleted(undefined);
    updateOp(() => ({ ...IDLE_OP }));
  }

  async function generate() {
    if (!file || !completed || !imgRef.current) return;
    updateOp(d => { d.status = 'processing'; d.progress = 0; d.error = ''; });

    try {
      let sourceFile = file;

      // Optional background removal
      if (removeBg) {
        updateOp(d => { d.progress = 10; });
        const { removeBackground } = await import('@imgly/background-removal');
        updateOp(d => { d.progress = 30; });
        const bgBlob = await removeBackground(file, {
          progress: (k: string, cur: number, total: number) => {
            if (k === 'compute:inference') {
              updateOp(d => { d.progress = 30 + Math.round((cur / total) * 40); });
            }
          },
        });
        sourceFile = new File([bgBlob], file.name, { type: bgBlob.type });
        updateOp(d => { d.progress = 70; });
      } else {
        updateOp(d => { d.progress = 40; });
      }

      // Reload source image (may have changed after bg removal)
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const el = new Image();
        const url = URL.createObjectURL(sourceFile);
        el.onload = () => { URL.revokeObjectURL(url); res(el); };
        el.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Image load failed')); };
        el.src = url;
      });

      updateOp(d => { d.progress = 80; });

      // previewScale: natural image / displayed image
      const previewScale = img.naturalWidth / (imgRef.current?.naturalWidth ?? img.naturalWidth);

      const { width: outW, height: outH } = getOutputPixels(standard, dpi);
      const blob = await renderPassportPhoto(img, completed, previewScale, outW, outH);

      const label = `${standard.id}_${outW}x${outH}_${dpi}dpi.jpg`;
      updateOp(d => { d.output = [{ name: label, blob, size: blob.size }]; d.status = 'done'; d.progress = 100; });
    } catch (e) {
      updateOp(d => { d.error = e instanceof Error ? e.message : 'Failed'; d.status = 'error'; });
    }
  }

  const aspect = standard.widthMm / standard.heightMm;
  const { width: outW, height: outH } = getOutputPixels(standard, dpi);

  return (
    <div className="space-y-5">
      {!file ? (
        <DropZone onFiles={handleFiles} accept="image/*" multiple={false}
          label="Drop your photo" sublabel="JPEG, PNG, WebP — full resolution recommended" />
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5">
            {/* Crop area */}
            <Card>
              <CardContent className="pt-4 pb-4 flex flex-col items-center gap-3">
                <p className="text-xs text-muted-foreground self-start">
                  Drag the crop box — fit your head inside the oval guide
                </p>
                <div className="relative">
                  <ReactCrop
                    crop={crop}
                    onChange={c => setCrop(c)}
                    onComplete={c => setCompleted(c)}
                    aspect={aspect}
                    minWidth={80}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      ref={imgRef}
                      src={imgSrc}
                      alt="Source"
                      style={{ maxHeight: 500, maxWidth: '100%' }}
                      onLoad={e => initCrop(e.currentTarget)}
                    />
                  </ReactCrop>

                  {/* Face guide — completed is already in display px, use directly */}
                  {completed && (
                    <svg
                      style={{
                        position: 'absolute',
                        left: completed.x,
                        top: completed.y,
                        width: completed.width,
                        height: completed.height,
                        pointerEvents: 'none',
                        zIndex: 20,
                        overflow: 'visible',
                      }}
                      viewBox={`0 0 ${completed.width} ${completed.height}`}
                    >
                      {/* Face oval: head covers faceMin–faceMax of photo height */}
                      <ellipse
                        cx={completed.width / 2}
                        cy={completed.height * standard.faceCenterY}
                        rx={completed.width * 0.28}
                        ry={completed.height * (standard.faceMin + standard.faceMax) / 4}
                        fill="none"
                        stroke="rgba(16,185,129,0.85)"
                        strokeWidth="2"
                        strokeDasharray="6 3"
                      />
                      {/* Eye-line */}
                      <line
                        x1={completed.width * 0.2}
                        y1={completed.height * (standard.faceCenterY - 0.04)}
                        x2={completed.width * 0.8}
                        y2={completed.height * (standard.faceCenterY - 0.04)}
                        stroke="rgba(16,185,129,0.5)"
                        strokeWidth="1"
                        strokeDasharray="4 3"
                      />
                      {/* Face range label */}
                      <text
                        x={completed.width / 2}
                        y={completed.height * (standard.faceCenterY + (standard.faceMin + standard.faceMax) / 4) + 14}
                        textAnchor="middle"
                        fill="rgba(16,185,129,0.9)"
                        fontSize={Math.max(9, completed.width * 0.07)}
                        fontFamily="monospace"
                      >
                        head {Math.round(standard.faceMin * 100)}–{Math.round(standard.faceMax * 100)}%
                      </text>
                    </svg>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Settings */}
            <div className="space-y-4">
              <Card>
                <CardContent className="pt-4 pb-4 space-y-4">
                  {/* Country */}
                  <div className="space-y-1.5">
                    <Label>Country standard</Label>
                    <div className="space-y-1">
                      {PASSPORT_STANDARDS.map(s => (
                        <button
                          key={s.id}
                          onClick={() => setStandard(s)}
                          className={`w-full text-left px-3 py-2 text-xs rounded border transition-colors ${
                            standard.id === s.id
                              ? 'border-brand-500 bg-brand-500/10 text-brand-500'
                              : 'border-border text-muted-foreground hover:bg-secondary'
                          }`}
                        >
                          <span className="font-medium">{s.country}</span>
                          <span className="ml-2 opacity-60">{s.widthMm}×{s.heightMm} mm</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* DPI */}
                  <div className="space-y-1.5">
                    <Label>Output DPI</Label>
                    <div className="flex gap-2">
                      {DPI_OPTIONS.map(d => (
                        <button key={d} onClick={() => setDpi(d)}
                          className={`flex-1 py-1.5 text-xs rounded border transition-colors ${
                            dpi === d
                              ? 'border-brand-500 bg-brand-500/10 text-brand-500 font-medium'
                              : 'border-border text-muted-foreground hover:bg-secondary'
                          }`}
                        >{d}</button>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      → {outW} × {outH} px
                    </p>
                  </div>

                  {/* Background removal */}
                  <div className="flex items-start gap-3 pt-1">
                    <Checkbox
                      id="remove-bg"
                      checked={removeBg}
                      onCheckedChange={v => setRemoveBg(v === true)}
                    />
                    <div>
                      <label htmlFor="remove-bg" className="text-xs font-medium text-foreground cursor-pointer">
                        Remove background
                      </label>
                      <p className="text-[10px] text-muted-foreground">
                        Replace with white (uses AI, ~10–30s)
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Button
                onClick={generate}
                disabled={!completed || status === 'processing'}
                className="w-full"
              >
                {status === 'processing' ? 'Generating…' : 'Generate Passport Photo'}
              </Button>

              <Button variant="secondary" onClick={() => {
                URL.revokeObjectURL(imgSrc);
                setFile(null); setImgSrc(''); setCrop(undefined); setCompleted(undefined);
                updateOp(() => ({ ...IDLE_OP }));
              }} className="w-full">
                Change Photo
              </Button>
            </div>
          </div>

          {status === 'processing' && (
            <ProgressBar progress={progress} label={removeBg ? 'Removing background…' : 'Generating photo…'} />
          )}
          {status === 'error' && (
            <p className="text-sm text-red-500 bg-red-500/10 px-4 py-3 rounded">{error}</p>
          )}
        </>
      )}

      {output.length > 0 && <OutputFiles files={output} />}
    </div>
  );
}
