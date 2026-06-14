import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import { useImmer } from 'use-immer';
import DropZone from '@/components/shared/DropZone';
import { useToolVisit } from '@/stores/toolVisit';
import ProgressBar from '@/components/shared/ProgressBar';
import OutputFiles from '@/components/shared/OutputFiles';
import { type ToolOp, IDLE_OP } from '@/lib/utils/toolState';
import PDFPageThumbnail from './PDFPageThumbnail';
import PDFFileBar from './PDFFileBar';
import { deletePages } from '@/lib/pdf/pdfDeletePages';
import { loadPDFDocument } from '@/lib/pdf/pdfLoader';
import { stripExtension } from '@/lib/utils/fileUtils';
import type { PDFDocumentProxy } from 'pdfjs-dist';

export default function PDFDeletePagesTool() {
  const { sessionFiles, setSessionFiles, clearSession } = useToolVisit('pdf', '/pdf/delete-pages');
  const [file,     setFile]     = useState<{ name: string; size: number; buffer: ArrayBuffer; pageCount: number } | null>(null);
  const [pdf,      setPdf]      = useState<PDFDocumentProxy | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [op, updateOp] = useImmer<ToolOp>({ ...IDLE_OP });
  const { status, progress, output, error } = op;

  useEffect(() => {
    if (sessionFiles.length > 0 && !file) {
      try { addFile([sessionFiles[0]]); } catch {}
    }
  }, []);

  const addFile = async ([f]: File[]) => {
    const buf = await f.arrayBuffer();
    const pdfDoc = await loadPDFDocument(buf.slice(0));
    setFile({ name: f.name, size: f.size, buffer: buf, pageCount: pdfDoc.numPages });
    setSessionFiles([f]);
    setPdf(pdfDoc);
    setSelected(new Set());
    updateOp(() => ({ ...IDLE_OP }));
  };

  const togglePage = (i: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  const selectAll = () => {
    if (!file) return;
    setSelected(new Set(Array.from({ length: file.pageCount }, (_, i) => i)));
  };

  const clearSelection = () => setSelected(new Set());

  const save = async () => {
    if (!file || selected.size === 0) return;
    if (selected.size === file.pageCount) {
      updateOp(d => { d.error = 'Cannot delete all pages — at least one page must remain.'; d.status = 'error'; });
      return;
    }
    updateOp(d => { d.status = 'processing'; d.progress = 0; d.error = ''; });
    try {
      const blob = await deletePages(file.buffer, selected, pct => updateOp(d => { d.progress = pct; }));
      const base = stripExtension(file.name);
      updateOp(d => { d.output = [{ name: `${base}_deleted.pdf`, blob, size: blob.size }]; d.status = 'done'; });
    } catch (e) {
      updateOp(d => { d.error = e instanceof Error ? e.message : 'Failed to delete pages'; d.status = 'error'; });
    }
  };

  const remainingCount = file ? file.pageCount - selected.size : 0;

  return (
    <div className="space-y-5">
      {!file ? (
        <DropZone
          onFiles={addFile}
          accept=".pdf,application/pdf"
          multiple={false}
          label="Drop a PDF file"
          sublabel="Select pages to delete, then save"
        />
      ) : (
        <PDFFileBar
          file={file}
          total={file.pageCount}
          onClear={() => { setFile(null); setPdf(null); setSelected(new Set()); updateOp(() => ({ ...IDLE_OP })); clearSession(); }}
        />
      )}

      {pdf && file && (
        <div className="card p-5 space-y-5">

          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {selected.size === 0
                ? 'Click pages to mark for deletion'
                : <span className="text-red-600 dark:text-red-400 font-medium">{selected.size} page{selected.size > 1 ? 's' : ''} marked — {remainingCount} will remain</span>
              }
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={selectAll} disabled={selected.size === file.pageCount}>
                Select all
              </Button>
              <Button size="sm" variant="secondary" onClick={clearSelection} disabled={selected.size === 0}>
                Clear
              </Button>
            </div>
          </div>

          {/* Page grid */}
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {Array.from({ length: file.pageCount }, (_, i) => {
              const marked = selected.has(i);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => togglePage(i)}
                  className={`
                    relative flex flex-col items-center gap-1.5 p-2 rounded-xl border-2 transition-all select-none
                    ${marked
                      ? 'border-red-500 bg-red-50 dark:bg-red-950/30 opacity-60'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-900'}
                  `}
                >
                  {marked && (
                    <div className="absolute inset-0 flex items-center justify-center z-10 rounded-xl bg-red-500/10">
                      <span className="text-red-500 text-2xl font-bold">✕</span>
                    </div>
                  )}
                  <PDFPageThumbnail pdf={pdf} pageNumber={i + 1} width={80} className="pointer-events-none" />
                  <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500">{i + 1}</span>
                </button>
              );
            })}
          </div>

          {status === 'processing' && <ProgressBar progress={progress} label="Deleting pages..." />}
          {status === 'error' && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-4 py-3 rounded-xl">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <Button
              onClick={save}
              disabled={selected.size === 0 || status === 'processing'}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {status === 'processing' ? 'Deleting…' : `Delete ${selected.size} page${selected.size !== 1 ? 's' : ''}`}
            </Button>
            <Button variant="secondary" onClick={clearSelection} disabled={selected.size === 0}>
              Clear selection
            </Button>
          </div>
        </div>
      )}

      {output.length > 0 && <OutputFiles files={output} />}
    </div>
  );
}
