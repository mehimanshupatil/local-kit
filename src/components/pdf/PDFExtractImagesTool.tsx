import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { useImmer } from 'use-immer';
import { Images, Download } from 'lucide-react';
// @ts-ignore
import JSZip from 'jszip';
import DropZone from '@/components/shared/DropZone';
import ProgressBar from '@/components/shared/ProgressBar';
import { extractImagesFromPDF, type ExtractedImage } from '@/lib/pdf/pdfExtractImages';
import { formatFileSize } from '@/lib/utils/fileUtils';

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function PDFExtractImagesTool() {
  const [file, setFile]       = useState<{ name: string; size: number; buffer: ArrayBuffer } | null>(null);
  const [status, setStatus]   = useState<'idle' | 'processing' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError]     = useState('');
  const [images, updateImages] = useImmer<ExtractedImage[]>([]);

  const addFile = async ([f]: File[]) => {
    setFile({ name: f.name, size: f.size, buffer: await f.arrayBuffer() });
    setStatus('idle');
    setError('');
    updateImages(() => []);
  };

  const extract = async () => {
    if (!file) return;
    setStatus('processing');
    setProgress(0);
    setError('');
    updateImages(() => []);
    try {
      const results = await extractImagesFromPDF(file.buffer.slice(0), pct => setProgress(pct));
      updateImages(() => results);
      setStatus('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Extraction failed');
      setStatus('error');
    }
  };

  const downloadAll = async () => {
    if (images.length === 0) return;
    const zip = new JSZip();
    for (const img of images) {
      zip.file(img.name, img.blob);
    }
    const blob: Blob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(blob, 'extracted_images.zip');
  };

  return (
    <div className="space-y-5">
      {!file ? (
        <DropZone
          onFiles={addFile}
          accept=".pdf,application/pdf"
          multiple={false}
          label="Drop a PDF file"
          sublabel="Embedded images will be extracted from each page"
        />
      ) : (
        <div className="flex items-center gap-3 px-4 py-3 card rounded-xl border">
          <span className="text-2xl">📄</span>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{file.name}</p>
            <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
          </div>
          <Button variant="secondary"
            onClick={() => { setFile(null); setStatus('idle'); setError(''); updateImages(() => []); }}
            className="text-xs py-1.5 px-3 shrink-0"
          >
            Change
          </Button>
        </div>
      )}

      {file && (
        <div className="card p-5 space-y-5">
          {/* Info */}
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <Images className="w-4 h-4 text-gray-500 dark:text-gray-400 mt-0.5 shrink-0" />
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Extracts embedded images found within the PDF pages. Results vary based on how the PDF was created.
            </p>
          </div>

          {/* Min size note */}
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Min image size filter</p>
            <div className="flex gap-2">
              {(['Small (32px)', 'Medium (100px)', 'Large (200px)'] as const).map((label, i) => (
                <span
                  key={i}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    i === 0
                      ? 'bg-brand-50 dark:bg-brand-950/30 border-brand-300 dark:border-brand-700 text-brand-700 dark:text-brand-300'
                      : 'border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-900'
                  }`}
                >
                  {label}
                </span>
              ))}
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
              Currently using 32px minimum threshold.
            </p>
          </div>

          {status === 'processing' && <ProgressBar progress={progress} label="Extracting images…" />}
          {status === 'error' && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-4 py-3 rounded-xl">
              {error}
            </p>
          )}

          <Button
            onClick={extract}
            disabled={status === 'processing'}
            
          >
            {status === 'processing' ? 'Extracting…' : 'Extract Images'}
          </Button>
        </div>
      )}

      {status === 'done' && (
        <div className="card p-5 space-y-4 animate-slide-up">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <span>✅</span>
              {images.length === 0
                ? 'No images found'
                : `${images.length} image${images.length !== 1 ? 's' : ''} extracted`}
            </h3>
            {images.length > 1 && (
              <Button onClick={downloadAll} className="text-xs py-1.5 px-3 flex items-center gap-1.5">
                <Download className="w-3.5 h-3.5" />
                Download All (.zip)
              </Button>
            )}
          </div>

          {images.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 px-4 py-3 rounded-xl">
              No embedded images were detected in this PDF. The document may use vector graphics or text-only content.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {images.map((img, i) => {
                const url = URL.createObjectURL(img.blob);
                return (
                  <div
                    key={i}
                    className="group rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-gray-50 dark:bg-gray-800 hover:border-brand-400 dark:hover:border-brand-600 transition-colors"
                  >
                    <div className="aspect-video flex items-center justify-center bg-white dark:bg-gray-900 overflow-hidden">
                      <img
                        src={url}
                        alt={img.name}
                        className="max-w-full max-h-full object-contain"
                        onLoad={() => URL.revokeObjectURL(url)}
                      />
                    </div>
                    <div className="px-3 py-2 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{img.name}</p>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500">
                          {img.width}×{img.height} · p{img.page} · {formatFileSize(img.blob.size)}
                        </p>
                      </div>
                      <Button variant="secondary"
                        onClick={() => downloadBlob(img.blob, img.name)}
                        className="text-[10px] py-1 px-2 shrink-0"
                        title="Download"
                      >
                        <Download className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
