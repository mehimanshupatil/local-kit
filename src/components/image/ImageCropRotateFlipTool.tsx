import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useState, useRef } from 'react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { RotateCcw, RotateCw } from 'lucide-react';
import DropZone from '@/components/shared/DropZone';
import OutputFiles, { type OutputFile } from '@/components/shared/OutputFiles';
import { applyTransform } from '@/lib/image/imageCropRotateFlip';
import { formatFileSize, stripExtension, getExtension } from '@/lib/utils/fileUtils';

export default function ImageCropRotateFlipTool() {
  const [file, setFile] = useState<File | null>(null);
  const [previewURL, setPreviewURL] = useState<string>('');
  const [crop, setCrop] = useState<Crop | undefined>(undefined);
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | undefined>(undefined);
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [status, setStatus] = useState<'idle' | 'processing' | 'done' | 'error'>('idle');
  const [output, setOutput] = useState<OutputFile[]>([]);
  const [error, setError] = useState('');
  const imgRef = useRef<HTMLImageElement>(null);

  const handleFiles = (files: File[]) => {
    const img = files.find(f => f.type.startsWith('image/'));
    if (!img) return;
    if (previewURL) URL.revokeObjectURL(previewURL);
    setFile(img);
    setPreviewURL(URL.createObjectURL(img));
    setCrop(undefined);
    setCompletedCrop(undefined);
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setStatus('idle');
    setOutput([]);
    setError('');
  };

  const handleChange = () => {
    if (previewURL) URL.revokeObjectURL(previewURL);
    setFile(null);
    setPreviewURL('');
    setCrop(undefined);
    setCompletedCrop(undefined);
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setStatus('idle');
    setOutput([]);
    setError('');
  };

  const rotateCW = () => setRotation(r => ((r + 90) % 360) as 0 | 90 | 180 | 270);
  const rotateCCW = () => setRotation(r => ((r + 270) % 360) as 0 | 90 | 180 | 270);
  const rotate180 = () => setRotation(r => ((r + 180) % 360) as 0 | 90 | 180 | 270);
  const resetRotation = () => setRotation(0);

  const handleApply = async () => {
    if (!file) return;
    setStatus('processing');
    setError('');
    try {
      const cropArg = completedCrop
        ? { x: completedCrop.x, y: completedCrop.y, width: completedCrop.width, height: completedCrop.height }
        : null;

      const blob = await applyTransform(file, { crop: cropArg, rotation, flipH, flipV });

      const ext = getExtension(file.name) || 'png';
      const name = `${stripExtension(file.name)}_edited.${ext}`;
      setOutput([{ name, blob, size: blob.size }]);
      setStatus('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Processing failed');
      setStatus('error');
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
      <div className="card p-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{file.name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{formatFileSize(file.size)}</p>
        </div>
        <Button variant="secondary" size="sm" className="shrink-0" onClick={handleChange}>
          Change
        </Button>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* LEFT: Interactive crop/preview */}
        <div className="card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Preview</h3>
          <div className="overflow-auto rounded-xl bg-gray-100 dark:bg-gray-800 flex items-start justify-center p-2">
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
        </div>

        {/* RIGHT: Controls */}
        <div className="space-y-4 flex flex-col">

          {/* Rotate */}
          <div className="card p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Rotate</h3>
            <div className="flex gap-2">
              <Button variant="secondary"
                onClick={rotateCCW}
                className="flex-1"
                title="Rotate 90° counter-clockwise"
              >
                <RotateCcw className="w-4 h-4" />
                <span>90° CCW</span>
              </Button>
              <Button variant="secondary"
                onClick={rotateCW}
                className="flex-1"
                title="Rotate 90° clockwise"
              >
                <RotateCw className="w-4 h-4" />
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
              <p className="text-xs text-brand-600 dark:text-brand-400">Current: {rotation}°</p>
            )}
          </div>

          {/* Flip */}
          <div className="card p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Flip</h3>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setFlipH(v => !v)}
                className={`flex-1 transition-all ${flipH ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/30 text-brand-700 dark:text-brand-300' : 'text-gray-700 dark:text-gray-300'}`}
              >
                <span className="text-base">↔</span>
                <span>Flip H</span>
              </Button>
              <Button
                variant="outline"
                onClick={() => setFlipV(v => !v)}
                className={`flex-1 transition-all ${flipV ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/30 text-brand-700 dark:text-brand-300' : 'text-gray-700 dark:text-gray-300'}`}
              >
                <span className="text-base">↕</span>
                <span>Flip V</span>
              </Button>
            </div>
          </div>

          {/* Crop */}
          <div className="card p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Crop</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Draw a crop area on the image.
            </p>
            {completedCrop && (
              <div className="flex items-center justify-between">
                <p className="text-xs text-brand-600 dark:text-brand-400">
                  {Math.round(completedCrop.width)} × {Math.round(completedCrop.height)}px selected
                </p>
                <Button variant="secondary" size="sm"
                  onClick={() => { setCrop(undefined); setCompletedCrop(undefined); }}
                >
                  Clear Crop
                </Button>
              </div>
            )}
          </div>

          {/* Spacer to push apply button to bottom */}
          <div className="flex-1" />

          {/* Error */}
          {status === 'error' && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-4 py-3 rounded-xl">
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
