import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { useImmer } from 'use-immer';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, rectSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import DropZone from '@/components/shared/DropZone';
import ProgressBar from '@/components/shared/ProgressBar';
import OutputFiles, { type OutputFile } from '@/components/shared/OutputFiles';
import PDFPageThumbnail from './PDFPageThumbnail';
import { reorderPDF } from '@/lib/pdf/pdfReorder';
import { loadPDFDocument } from '@/lib/pdf/pdfLoader';
import { formatFileSize, stripExtension } from '@/lib/utils/fileUtils';
import type { PDFDocumentProxy } from 'pdfjs-dist';

// ── Sortable page card ─────────────────────────────────────────────
function SortablePage({
  pageIndex,
  displayIndex,
  pdf,
}: {
  pageIndex: number;   // 0-indexed original page number (the id / value in order array)
  displayIndex: number; // position in current order (0-indexed)
  pdf: PDFDocumentProxy;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: pageIndex });
  const isReordered = pageIndex !== displayIndex;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`
        relative flex flex-col items-center gap-1.5 p-2 rounded-xl border-2 transition-all select-none cursor-grab active:cursor-grabbing
        ${isDragging
          ? 'border-brand-500 shadow-xl opacity-90 z-50 bg-white dark:bg-gray-900 scale-105'
          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-900'}
      `}
      {...attributes}
      {...listeners}
    >
      {/* Original page number badge — shown when page is out of its original position */}
      {isReordered && (
        <div className="absolute top-1.5 left-1.5 z-10 bg-amber-400 text-amber-900 text-[9px] font-bold px-1 py-0.5 rounded leading-none">
          p{pageIndex + 1}
        </div>
      )}

      <PDFPageThumbnail pdf={pdf} pageNumber={pageIndex + 1} width={80} />

      {/* Current display position */}
      <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500">
        {displayIndex + 1}
      </span>
    </div>
  );
}

// ── Main tool ──────────────────────────────────────────────────────
export default function PDFReorderTool() {
  const [file,     setFile]     = useState<{ name: string; size: number; buffer: ArrayBuffer; pageCount: number } | null>(null);
  const [pdf,      setPdf]      = useState<PDFDocumentProxy | null>(null);
  const [pageOrder, updatePageOrder] = useImmer<number[]>([]);
  const [status,   setStatus]   = useState<'idle' | 'processing' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [output,   setOutput]   = useState<OutputFile[]>([]);
  const [error,    setError]    = useState('');

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const addFile = async ([f]: File[]) => {
    const buf = await f.arrayBuffer();
    const pdfDoc = await loadPDFDocument(buf.slice(0));
    setFile({ name: f.name, size: f.size, buffer: buf, pageCount: pdfDoc.numPages });
    setPdf(pdfDoc);
    updatePageOrder(() => Array.from({ length: pdfDoc.numPages }, (_, i) => i));
    setStatus('idle'); setOutput([]);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    updatePageOrder(draft => {
      const from = draft.indexOf(active.id as number);
      const to   = draft.indexOf(over.id as number);
      const moved = arrayMove(draft as number[], from, to);
      moved.forEach((val, i) => { draft[i] = val; });
    });
  };

  const resetOrder = () => {
    if (!file) return;
    updatePageOrder(() => Array.from({ length: file.pageCount }, (_, i) => i));
  };

  const save = async () => {
    if (!file) return;
    setStatus('processing'); setProgress(0); setError('');
    try {
      const blob = await reorderPDF(file.buffer, pageOrder, setProgress);
      setOutput([{ name: `${stripExtension(file.name)}_reordered.pdf`, blob, size: blob.size }]);
      setStatus('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reorder PDF');
      setStatus('error');
    }
  };

  const isReordered = pageOrder.some((p, i) => p !== i);

  return (
    <div className="space-y-5">
      {!file ? (
        <DropZone
          onFiles={addFile}
          accept=".pdf,application/pdf"
          multiple={false}
          label="Drop a PDF file"
          sublabel="Drag page thumbnails to reorder, then save"
        />
      ) : (
        <div className="flex items-center gap-3 px-4 py-3 card rounded-xl border">
          <span className="text-2xl">📄</span>
          <div className="flex-1">
            <p className="font-medium text-gray-900 dark:text-gray-100">{file.name}</p>
            <p className="text-xs text-gray-500">
              {file.pageCount} page{file.pageCount !== 1 ? 's' : ''} · {formatFileSize(file.size)}
            </p>
          </div>
          <Button variant="secondary"
            onClick={() => { setFile(null); setPdf(null); updatePageOrder(() => []); setOutput([]); setStatus('idle'); }}
            className="text-xs py-1.5 px-3"
          >
            Change
          </Button>
        </div>
      )}

      {pdf && file && pageOrder.length > 0 && (
        <div className="card p-5 space-y-5">

          {/* Order hint */}
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {isReordered
              ? <span className="text-amber-600 dark:text-amber-400">Order changed — amber badge shows original page number</span>
              : 'Drag thumbnails to reorder pages'}
          </p>

          {/* Sortable grid */}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={pageOrder} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {pageOrder.map((originalIndex, displayIndex) => (
                  <SortablePage
                    key={originalIndex}
                    pageIndex={originalIndex}
                    displayIndex={displayIndex}
                    pdf={pdf}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {status === 'processing' && <ProgressBar progress={progress} label="Saving reordered PDF..." />}
          {status === 'error' && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-4 py-3 rounded-xl">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <Button
              onClick={save}
              disabled={status === 'processing'}
              
            >
              {status === 'processing' ? 'Saving…' : 'Save Reordered PDF'}
            </Button>
            <Button
              onClick={resetOrder}
              disabled={!isReordered || status === 'processing'}
              variant="secondary"
            >
              Reset Order
            </Button>
          </div>
        </div>
      )}

      {output.length > 0 && <OutputFiles files={output} />}
    </div>
  );
}
