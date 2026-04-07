import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import DropZone from '@/components/shared/DropZone';
import { removeImageBackground } from '@/lib/image/imageBackgroundRemoval';
import { formatFileSize, stripExtension } from '@/lib/utils/fileUtils';

type Status = 'idle' | 'processing' | 'done' | 'error';

const checkerboardStyle: React.CSSProperties = {
  backgroundImage: `
    linear-gradient(45deg, #ccc 25%, transparent 25%),
    linear-gradient(-45deg, #ccc 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #ccc 75%),
    linear-gradient(-45deg, transparent 75%, #ccc 75%)
  `,
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
};

function formatStage(key: string): string {
  if (key.includes('fetch')) return 'Downloading model…';
  if (key.includes('compute')) return 'Removing background…';
  if (key.includes('load')) return 'Loading model…';
  return 'Processing…';
}

export default function ImageBackgroundRemovalTool() {
  const [file, setFile] = useState<File | null>(null);
  const [previewURL, setPreviewURL] = useState('');
  const [resultURL, setResultURL] = useState('');
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [stage, setStage] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const handleFiles = (files: File[]) => {
    const f = files[0];
    if (!f) return;
    if (previewURL) URL.revokeObjectURL(previewURL);
    if (resultURL) URL.revokeObjectURL(resultURL);
    setFile(f);
    setPreviewURL(URL.createObjectURL(f));
    setResultURL('');
    setResultBlob(null);
    setStatus('idle');
    setError('');
    setProgress(0);
    setStage('');
  };

  const handleChange = () => {
    if (previewURL) URL.revokeObjectURL(previewURL);
    if (resultURL) URL.revokeObjectURL(resultURL);
    setFile(null);
    setPreviewURL('');
    setResultURL('');
    setResultBlob(null);
    setStatus('idle');
    setError('');
    setProgress(0);
    setStage('');
  };

  const handleRemove = async () => {
    if (!file) return;
    setStatus('processing');
    setStage('Initializing…');
    setProgress(0);
    setError('');

    try {
      const blob = await removeImageBackground(file, (key, pct) => {
        setStage(formatStage(key));
        setProgress(pct);
      });
      const url = URL.createObjectURL(blob);
      setResultBlob(blob);
      setResultURL(url);
      setStatus('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Background removal failed');
      setStatus('error');
    }
  };

  const handleDownload = () => {
    if (!resultURL || !file) return;
    const a = document.createElement('a');
    a.href = resultURL;
    a.download = `${stripExtension(file.name)}_no_bg.png`;
    a.click();
  };

  if (!file) {
    return (
      <div className="space-y-5">
        <DropZone
          onFiles={handleFiles}
          accept="image/*"
          multiple={false}
          label="Drop an image"
          sublabel="JPG, PNG, WebP — background will be removed"
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* File info bar */}
      <div className="card p-5 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{file.name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{formatFileSize(file.size)}</p>
        </div>
        <Button variant="secondary" onClick={handleChange} className="text-sm">
          Change
        </Button>
      </div>

      {/* Preview area */}
      {status !== 'processing' && (
        <div className="card p-5 space-y-4">
          {resultURL ? (
            /* Side-by-side before / after */
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 text-center">
                  Before
                </p>
                <div
                  className="rounded-xl overflow-hidden flex items-center justify-center"
                  style={checkerboardStyle}
                >
                  <img
                    src={previewURL}
                    alt="Original"
                    className="max-h-64 w-full object-contain"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 text-center">
                  After
                </p>
                <div
                  className="rounded-xl overflow-hidden flex items-center justify-center"
                  style={checkerboardStyle}
                >
                  <img
                    src={resultURL}
                    alt="Background removed"
                    className="max-h-64 w-full object-contain"
                  />
                </div>
              </div>
            </div>
          ) : (
            /* Single centered preview before processing */
            <div className="space-y-2">
              <div
                className="rounded-xl overflow-hidden flex items-center justify-center"
                style={checkerboardStyle}
              >
                <img
                  src={previewURL}
                  alt="Original"
                  className="max-h-64 w-full object-contain"
                />
              </div>
            </div>
          )}

          {/* Error display */}
          {status === 'error' && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-4 py-3 rounded-xl">
              {error}
            </p>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            {status === 'done' ? (
              <>
                <Button onClick={handleDownload} >
                  Download PNG
                </Button>
                <Button onClick={handleChange} variant="secondary">
                  Try another
                </Button>
              </>
            ) : (
              <Button onClick={handleRemove} >
                Remove Background
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Processing state */}
      {status === 'processing' && (
        <div className="card p-5 space-y-4">
          <div className="flex flex-col items-center gap-4 py-4">
            {/* Spinner */}
            <div className="w-10 h-10 rounded-full border-4 border-gray-200 dark:border-gray-700 border-t-brand-500 animate-spin" />

            {/* Stage label */}
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{stage}</p>

            {/* Progress bar */}
            <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2 overflow-hidden">
              <div
                className="h-2 rounded-full bg-brand-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{progress}%</p>

            {/* Model download note */}
            <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
              First run downloads ~50 MB model. Cached for future use.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
