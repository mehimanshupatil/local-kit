import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import { useImmer } from 'use-immer';
import { ImagesIcon, DownloadSimpleIcon } from '@phosphor-icons/react';
import { useToolVisit } from '@/stores/toolVisit';
// @ts-ignore
import JSZip from 'jszip';
import DropZone from '@/components/shared/DropZone';
import ProgressBar from '@/components/shared/ProgressBar';
import { extractImagesFromPDF, type ExtractedImage } from '@/lib/pdf/pdfExtractImages';
import { formatFileSize } from '@/lib/utils/fileUtils';
import PDFFileBar from './PDFFileBar';
import { type ToolOp, IDLE_OP } from '@/lib/utils/toolState';

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function PDFExtractImagesTool() {
  const { sessionFiles, setSessionFiles, clearSession } = useToolVisit('pdf', '/pdf/extract-images');
  const [file, setFile]       = useState<{ name: string; size: number; buffer: ArrayBuffer } | null>(null);
  const [op, updateOp] = useImmer<ToolOp>({ ...IDLE_OP });
  const { status, progress, error } = op;
  const [images, updateImages] = useImmer<ExtractedImage[]>([]);

  useEffect(() => {
    if (sessionFiles.length > 0 && !file) {
      try { addFile([sessionFiles[0]]); } catch {}
    }
  }, []);

  const addFile = async ([f]: File[]) => {
    setFile({ name: f.name, size: f.size, buffer: await f.arrayBuffer() });
    setSessionFiles([f]);
    updateOp(() => ({ ...IDLE_OP }));
    updateImages(() => []);
  };

  const extract = async () => {
    if (!file) return;
    updateOp(d => { d.status = 'processing'; d.progress = 0; d.error = ''; });
    updateImages(() => []);
    try {
      const results = await extractImagesFromPDF(file.buffer.slice(0), pct => updateOp(d => { d.progress = pct; }));
      updateImages(() => results);
      updateOp(d => { d.status = 'done'; });
    } catch (e) {
      updateOp(d => { d.error = e instanceof Error ? e.message : 'Extraction failed'; d.status = 'error'; });
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
        <PDFFileBar file={file} onClear={() => { setFile(null); updateOp(() => ({ ...IDLE_OP })); updateImages(() => []); clearSession(); }} />
      )}

      {file && (
        <Card className="p-5 space-y-5">
          {/* Info */}
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-secondary border border-border">
            <ImagesIcon className="size-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-sm text-muted-foreground">
              Extracts embedded images found within the PDF pages. Results vary based on how the PDF was created.
            </p>
          </div>

          {/* Min size note */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Min image size filter</p>
            <div className="flex gap-2">
              {(['Small (32px)', 'Medium (100px)', 'Large (200px)'] as const).map((label, i) => (
                <span
                  key={i}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                    i === 0
                      ? 'bg-brand-500/10 border-brand-300 dark:border-brand-700 text-brand-400'
                      : 'border-border text-muted-foreground bg-card'
                  }`}
                >
                  {label}
                </span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
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
        </Card>
      )}

      {status === 'done' && (
        <Card className="p-5 space-y-4 animate-slide-up">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <span>✅</span>
              {images.length === 0
                ? 'No images found'
                : `${images.length} image${images.length !== 1 ? 's' : ''} extracted`}
            </h3>
            {images.length > 1 && (
              <Button size="sm" onClick={downloadAll}>
                <DownloadSimpleIcon className="size-3.5" />
                Download All (.zip)
              </Button>
            )}
          </div>

          {images.length === 0 ? (
            <p className="text-sm text-muted-foreground bg-secondary px-4 py-3 rounded-xl">
              No embedded images were detected in this PDF. The document may use vector graphics or text-only content.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {images.map((img, i) => {
                const url = URL.createObjectURL(img.blob);
                return (
                  <div
                    key={i}
                    className="group rounded-xl border border-border overflow-hidden bg-secondary hover:border-brand-400 dark:hover:border-brand-600 transition-colors"
                  >
                    <div className="aspect-video flex items-center justify-center bg-card overflow-hidden">
                      <img
                        src={url}
                        alt={img.name}
                        className="max-w-full max-h-full object-contain"
                        onLoad={() => URL.revokeObjectURL(url)}
                      />
                    </div>
                    <div className="px-3 py-2 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{img.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {img.width}×{img.height} · p{img.page} · {formatFileSize(img.blob.size)}
                        </p>
                      </div>
                      <Button variant="secondary" size="sm" className="shrink-0"
                        onClick={() => downloadBlob(img.blob, img.name)}
                        title="Download"
                      >
                        <DownloadSimpleIcon className="size-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
