import { enableMapSet } from 'immer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { useImmer } from 'use-immer';
import { Check, RotateCcw, RotateCw, X } from 'lucide-react';

enableMapSet();
import DropZone from '@/components/shared/DropZone';
import ProgressBar from '@/components/shared/ProgressBar';
import OutputFiles, { type OutputFile } from '@/components/shared/OutputFiles';
import PDFPageThumbnail from './PDFPageThumbnail';
import { PDFDocument, degrees } from '@cantoo/pdf-lib';
import { loadPDFDocument } from '@/lib/pdf/pdfLoader';
import { stripExtension } from '@/lib/utils/fileUtils';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import PDFFileBar from './PDFFileBar';

export default function PDFRotateTool() {
  const [file,  setFile]  = useState<{ name: string; size: number; buffer: ArrayBuffer } | null>(null);
  const [pdf,   setPdf]   = useState<PDFDocumentProxy | null>(null);
  const [total, setTotal] = useState(0);
  // Per-page rotation delta (added on top of existing rotation)
  const [rotations, updateRotations] = useImmer<number[]>([]);
  const [selected,  updateSelected]  = useImmer<Set<number>>(new Set());
  const [status, setStatus]   = useState<'idle' | 'processing' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [output,   setOutput] = useState<OutputFile[]>([]);
  const [error,    setError]  = useState('');

  const addFile = async ([f]: File[]) => {
    const buf = await f.arrayBuffer();
    const pdfDoc = await loadPDFDocument(buf.slice(0));
    setFile({ name: f.name, size: f.size, buffer: buf });
    setPdf(pdfDoc);
    setTotal(pdfDoc.numPages);
    updateRotations(() => Array(pdfDoc.numPages).fill(0));
    updateSelected(() => new Set());
    setStatus('idle'); setOutput([]);
  };

  const toggleSelect = (i: number, e: React.MouseEvent) => {
    updateSelected(draft => {
      if (e.shiftKey && draft.size > 0) {
        const last = Math.max(...Array.from(draft));
        const [lo, hi] = [Math.min(i, last), Math.max(i, last)];
        for (let j = lo; j <= hi; j++) draft.add(j);
      } else {
        draft.has(i) ? draft.delete(i) : draft.add(i);
      }
    });
  };

  const rotatePage = (i: number, deg: number) => {
    updateRotations(draft => {
      draft[i] = ((draft[i] + deg) % 360 + 360) % 360;
    });
  };

  const rotateSelected = (deg: number) => {
    if (selected.size === 0) return;
    updateRotations(draft => {
      selected.forEach(i => { draft[i] = ((draft[i] + deg) % 360 + 360) % 360; });
    });
  };

  const selectAll  = () => updateSelected(() => new Set(Array.from({ length: total }, (_, i) => i)));
  const selectNone = () => updateSelected(() => new Set());

  const apply = async () => {
    if (!file) return;
    setStatus('processing'); setProgress(0); setError('');
    try {
      const doc = await PDFDocument.load(file.buffer);
      const pages = doc.getPages();
      pages.forEach((page, i) => {
        if (rotations[i] !== 0) {
          const current = page.getRotation().angle;
          page.setRotation(degrees((current + rotations[i]) % 360));
        }
      });
      onProgress?.(80);
      const bytes = await doc.save();
      setProgress(100);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      setOutput([{ name: `${stripExtension(file.name)}_rotated.pdf`, blob, size: blob.size }]);
      setStatus('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rotation failed'); setStatus('error');
    }
  };

  // fix: onProgress not defined above
  const onProgress = (n: number) => setProgress(n);

  const hasRotations = rotations.some(r => r !== 0);
  const rotatedCount = rotations.filter(r => r !== 0).length;

  return (
    <div className="space-y-5">
      {!file ? (
        <DropZone onFiles={addFile} accept=".pdf,application/pdf" multiple={false}
          label="Drop a PDF file" sublabel="Click pages to select, then rotate" />
      ) : (
        <PDFFileBar file={file} total={total} onClear={() => { setFile(null); setPdf(null); setOutput([]); }} />
      )}

      {pdf && total > 0 && (
        <div className="card p-5 space-y-5">

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1">
              <Button onClick={selectAll}  variant="secondary" size="sm">Select all</Button>
              <Button onClick={selectNone} variant="secondary" size="sm" disabled={selected.size === 0}>Deselect</Button>
            </div>

            <div className="h-5 w-px bg-gray-200 dark:bg-gray-700 mx-1" />

            <span className="text-xs text-gray-500 dark:text-gray-400">
              {selected.size > 0 ? `${selected.size} selected` : 'Click pages to select'}
            </span>

            <div className="flex gap-1 ml-auto">
              {[
                { deg: 90,  label: '↻ 90°',  title: 'Rotate 90° clockwise' },
                { deg: 180, label: '↔ 180°', title: 'Rotate 180°' },
                { deg: 270, label: '↺ 90°',  title: 'Rotate 90° counter-clockwise' },
              ].map(({ deg, label, title }) => (
                <Button variant="secondary"
                  key={deg}
                  size="sm"
                  title={title}
                  onClick={() => selected.size > 0 ? rotateSelected(deg) : null}
                  disabled={selected.size === 0}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          {/* Page grid */}
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {Array.from({ length: total }, (_, i) => {
              const rot = rotations[i];
              const isSel = selected.has(i);
              return (
                <div
                  key={i}
                  onClick={e => toggleSelect(i, e)}
                  className={`
                    relative flex flex-col items-center gap-1.5 p-2 rounded-xl border-2 cursor-pointer transition-all select-none
                    ${isSel
                      ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/30 shadow-md scale-[1.03]'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-900'}
                  `}
                >
                  {/* Selected checkmark */}
                  {isSel && (
                    <div className="absolute top-1.5 right-1.5 z-10 w-4 h-4 bg-brand-500 rounded-full flex items-center justify-center">
                      <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                    </div>
                  )}

                  {/* Rotation badge */}
                  {rot !== 0 && (
                    <div className="absolute top-1.5 left-1.5 z-10 bg-amber-400 text-amber-900 text-[9px] font-bold px-1 py-0.5 rounded">
                      {rot}°
                    </div>
                  )}

                  {/* Thumbnail with CSS rotation preview */}
                  <div className="overflow-hidden rounded" style={{
                    width: 72, height: 88,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <div style={{ transform: `rotate(${rot}deg)`, transition: 'transform 0.25s ease', transformOrigin: 'center' }}>
                      <PDFPageThumbnail pdf={pdf} pageNumber={i + 1} width={rot === 90 || rot === 270 ? 60 : 72} />
                    </div>
                  </div>

                  {/* Page number + per-page controls */}
                  <div className="flex items-center gap-1 w-full justify-between">
                    <span className="text-[10px] font-mono text-gray-400">{i + 1}</span>
                    <div className="flex gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={e => { e.stopPropagation(); rotatePage(i, -90); }}
                        className="size-6 text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                        title="Rotate 90° CCW"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={e => { e.stopPropagation(); rotatePage(i, 90); }}
                        className="size-6 text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                        title="Rotate 90° CW"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                      </Button>
                      {rot !== 0 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={e => { e.stopPropagation(); rotatePage(i, -rot); }}
                          className="size-6 text-amber-400 hover:text-red-500"
                          title="Reset rotation"
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Summary */}
          {hasRotations && (
            <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 px-4 py-2.5 rounded-xl">
              {rotatedCount} page{rotatedCount > 1 ? 's' : ''} will be rotated
            </p>
          )}

          {status === 'processing' && <ProgressBar progress={progress} label="Applying rotations..." />}
          {status === 'error' && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-4 py-3 rounded-xl">{error}</p>}

          <Button onClick={apply} disabled={!hasRotations || status === 'processing'} >
            {status === 'processing' ? 'Saving...' : `Apply Rotations${rotatedCount > 0 ? ` (${rotatedCount} page${rotatedCount > 1 ? 's' : ''})` : ''}`}
          </Button>
        </div>
      )}

      {output.length > 0 && <OutputFiles files={output} />}
    </div>
  );
}
