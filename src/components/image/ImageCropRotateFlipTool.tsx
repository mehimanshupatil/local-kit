import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useState, useRef, useEffect } from 'react';
import { useImmer } from 'use-immer';
import { useDisclosure } from '@mantine/hooks';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { ArrowCounterClockwiseIcon, ArrowClockwiseIcon } from '@phosphor-icons/react';
import DropZone from '@/components/shared/DropZone';
import OutputFiles from '@/components/shared/OutputFiles';
import { applyTransform } from '@/lib/image/imageCropRotateFlip';
import { formatFileSize, stripExtension, getExtension } from '@/lib/utils/fileUtils';
import { useToolVisit } from '@/stores/toolVisit';
import { type ToolOp, IDLE_OP } from '@/lib/utils/toolState';

export default function ImageCropRotateFlipTool() {
  const [file, setFile] = useState<File | null>(null);
  const [previewURL, setPreviewURL] = useState<string>('');
  const [crop, setCrop] = useState<Crop | undefined>(undefined);
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | undefined>(undefined);
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [flipH, { toggle: toggleFlipH, close: resetFlipH }] = useDisclosure(false);
  const [flipV, { toggle: toggleFlipV, close: resetFlipV }] = useDisclosure(false);
  const [op, updateOp] = useImmer<ToolOp>({ ...IDLE_OP });
  const { status, progress, output, error } = op;
  const imgRef = useRef<HTMLImageElement>(null);
  const { sessionFiles, setSessionFiles, clearSession } = useToolVisit('image', '/image/crop-rotate-flip');

  const handleFiles = (files: File[]) => {
    const img = files.find(f => f.type.startsWith('image/'));
    if (!img) return;
    if (previewURL) URL.revokeObjectURL(previewURL);
    setFile(img);
    setSessionFiles([img]);
    setPreviewURL(URL.createObjectURL(img));
    setCrop(undefined);
    setCompletedCrop(undefined);
    setRotation(0);
    resetFlipH();
    resetFlipV();
    updateOp(() => ({ ...IDLE_OP }));
  };

  const handleChange = () => {
    if (previewURL) URL.revokeObjectURL(previewURL);
    setFile(null);
    setPreviewURL('');
    setCrop(undefined);
    setCompletedCrop(undefined);
    setRotation(0);
    resetFlipH();
    resetFlipV();
    updateOp(() => ({ ...IDLE_OP }));
    clearSession();
  };

  // Seed from session on mount
  useEffect(() => {
    if (sessionFiles.length > 0 && !file) { handleFiles([sessionFiles[0]]); }
  }, []);

  const rotateCW = () => setRotation(r => ((r + 90) % 360) as 0 | 90 | 180 | 270);
  const rotateCCW = () => setRotation(r => ((r + 270) % 360) as 0 | 90 | 180 | 270);
  const rotate180 = () => setRotation(r => ((r + 180) % 360) as 0 | 90 | 180 | 270);
  const resetRotation = () => setRotation(0);

  const handleApply = async () => {
    if (!file) return;
    updateOp(d => { d.status = 'processing'; d.error = ''; });
    try {
      const cropArg = completedCrop
        ? { x: completedCrop.x, y: completedCrop.y, width: completedCrop.width, height: completedCrop.height }
        : null;

      const blob = await applyTransform(file, { crop: cropArg, rotation, flipH, flipV });

      const ext = getExtension(file.name) || 'png';
      const name = `${stripExtension(file.name)}_edited.${ext}`;
      updateOp(d => { d.output = [{ name, blob, size: blob.size }]; d.status = 'done'; });
    } catch (e) {
      updateOp(d => { d.error = e instanceof Error ? e.message : 'Processing failed'; d.status = 'error'; });
    }
  };

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

        {/* LEFT: Interactive crop/preview */}
        <Card className="p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Preview</h3>
          <div className="overflow-auto rounded-xl bg-secondary flex items-start justify-center p-2">
            <ReactCrop
              crop={crop}
              onChange={c => setCrop(c)}
              onComplete={c => setCompletedCrop(c)}
            >
              <img
                ref={imgRef}
                src={previewURL}
                alt="Preview"
                className="max-w-full block rounded"
                style={{
                  transform: [
                    `rotate(${rotation}deg)`,
                    flipH ? 'scaleX(-1)' : '',
                    flipV ? 'scaleY(-1)' : '',
                  ].filter(Boolean).join(' ') || undefined,
                  transition: 'transform 0.2s ease',
                }}
              />
            </ReactCrop>
          </div>
        </Card>

        {/* RIGHT: Controls */}
        <div className="space-y-4 flex flex-col">

          {/* Rotate */}
          <Card className="p-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Rotate</h3>
            <div className="flex gap-2">
              <Button variant="secondary"
                onClick={rotateCCW}
                className="flex-1"
                title="Rotate 90° counter-clockwise"
              >
                <ArrowCounterClockwiseIcon className="size-4" />
                <span>90° CCW</span>
              </Button>
              <Button variant="secondary"
                onClick={rotateCW}
                className="flex-1"
                title="Rotate 90° clockwise"
              >
                <ArrowClockwiseIcon className="size-4" />
                <span>90° CW</span>
              </Button>
              <Button variant="secondary"
                onClick={rotate180}
                className="flex-1"
                title="Rotate 180°"
              >
                <span>180°</span>
              </Button>
              <Button variant="secondary"
                onClick={resetRotation}
                className="flex-1"
                title="Reset rotation"
                disabled={rotation === 0}
              >
                <span>Reset</span>
              </Button>
            </div>
            {rotation !== 0 && (
              <p className="text-xs text-brand-500">Current: {rotation}°</p>
            )}
          </Card>

          {/* Flip */}
          <Card className="p-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Flip</h3>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={toggleFlipH}
                className={`flex-1 transition-all ${flipH ? 'border-brand-500 bg-brand-500/10 text-brand-400' : 'text-foreground'}`}
              >
                <span className="text-base">↔</span>
                <span>Flip H</span>
              </Button>
              <Button
                variant="outline"
                onClick={toggleFlipV}
                className={`flex-1 transition-all ${flipV ? 'border-brand-500 bg-brand-500/10 text-brand-400' : 'text-foreground'}`}
              >
                <span className="text-base">↕</span>
                <span>Flip V</span>
              </Button>
            </div>
          </Card>

          {/* Crop */}
          <Card className="p-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Crop</h3>
            <p className="text-sm text-muted-foreground">
              Draw a crop area on the image.
            </p>
            {completedCrop && (
              <div className="flex items-center justify-between">
                <p className="text-xs text-brand-500">
                  {Math.round(completedCrop.width)} × {Math.round(completedCrop.height)}px selected
                </p>
                <Button variant="secondary" size="sm"
                  onClick={() => { setCrop(undefined); setCompletedCrop(undefined); }}
                >
                  Clear Crop
                </Button>
              </div>
            )}
          </Card>

          {/* Spacer to push apply button to bottom */}
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
            disabled={status === 'processing'}
            size="lg"
            className="w-full"
          >
            {status === 'processing' ? 'Processing…' : 'Apply Transforms'}
          </Button>
        </div>
      </div>

      {/* Output */}
      <OutputFiles files={output} />
    </div>
  );
}
