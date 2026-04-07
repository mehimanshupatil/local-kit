import { useState } from 'react';
import { useImmer } from 'use-immer';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, horizontalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, X, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import DropZone from '@/components/shared/DropZone';
import ProgressBar from '@/components/shared/ProgressBar';
import OutputFiles, { type OutputFile } from '@/components/shared/OutputFiles';
import PDFPageThumbnail from './PDFPageThumbnail';
import { mergePDFs } from '@/lib/pdf/pdfMerge';
import { loadPDFDocument } from '@/lib/pdf/pdfLoader';
import { generateId, formatFileSize } from '@/lib/utils/fileUtils';
import { cn } from '@/lib/utils/cn';
import type { PDFDocumentProxy } from 'pdfjs-dist';

interface FileEntry {
  id: string;
  name: string;
  size: number;
  buffer: ArrayBuffer;
  pageCount: number;
  pdf: PDFDocumentProxy;
}

// ── Sortable file row ─────────────────────────────────────────────
function SortableRow({ file, index, onRemove }: { file: FileEntry; index: number; onRemove: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: file.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 bg-white dark:bg-gray-900 transition-all',
        isDragging
          ? 'border-brand-500 shadow-lg opacity-90 z-50'
          : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700',
      )}
    >
      {/* Drag grip */}
      <Button
        {...attributes}
        {...listeners}
        variant="ghost"
        size="icon"
        className="touch-none cursor-grab active:cursor-grabbing text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400"
      >
        <GripVertical className="w-4 h-4" />
      </Button>

      <span className="text-xs text-gray-400 font-mono w-5 text-center shrink-0">{index + 1}</span>

      {/* First page thumbnail */}
      <div className="shrink-0">
        <PDFPageThumbnail pdf={file.pdf} pageNumber={1} width={44} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{file.name}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {file.pageCount} page{file.pageCount !== 1 ? 's' : ''} · {formatFileSize(file.size)}
        </p>
      </div>

      {/* Page strip (up to 3 pages) */}
      {file.pageCount > 1 && (
        <div className="hidden sm:flex gap-1 items-center shrink-0">
          {Array.from({ length: Math.min(file.pageCount, 3) }, (_, p) => (
            <PDFPageThumbnail key={p} pdf={file.pdf} pageNumber={p + 1} width={28} />
          ))}
          {file.pageCount > 3 && (
            <span className="text-xs text-gray-400 ml-0.5">+{file.pageCount - 3}</span>
          )}
        </div>
      )}

      <Button
        variant="ghost"
        size="icon"
        onClick={() => onRemove(file.id)}
        className="shrink-0 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}

// ── Main tool ─────────────────────────────────────────────────────
export default function PDFMergeTool() {
  const [files, updateFiles]    = useImmer<FileEntry[]>([]);
  const [status, setStatus]     = useState<'idle' | 'processing' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [output, setOutput]     = useState<OutputFile[]>([]);
  const [error, setError]       = useState('');

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const addFiles = async (incoming: File[]) => {
    const pdfs = incoming.filter(f => f.type === 'application/pdf' || f.name.endsWith('.pdf'));
    const entries: FileEntry[] = [];
    for (const f of pdfs) {
      const buffer = await f.arrayBuffer();
      const pdf = await loadPDFDocument(buffer.slice(0));
      entries.push({ id: generateId(), name: f.name, size: f.size, buffer, pageCount: pdf.numPages, pdf });
    }
    updateFiles(draft => { draft.push(...entries); });
    setStatus('idle'); setOutput([]);
  };

  const remove = (id: string) => updateFiles(draft => { const i = draft.findIndex(f => f.id === id); if (i !== -1) draft.splice(i, 1); });

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    updateFiles(draft => {
      const from = draft.findIndex(f => f.id === active.id);
      const to   = draft.findIndex(f => f.id === over.id);
      const moved = arrayMove(draft as FileEntry[], from, to);
      moved.forEach((item, i) => { draft[i] = item; });
    });
  };

  const merge = async () => {
    if (files.length < 2) return;
    setStatus('processing'); setProgress(0); setError('');
    try {
      const blob = await mergePDFs(files.map(f => f.buffer), setProgress);
      setOutput([{ name: 'merged.pdf', blob, size: blob.size }]);
      setStatus('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to merge'); setStatus('error');
    }
  };

  const totalPages = files.reduce((s, f) => s + f.pageCount, 0);

  return (
    <div className="space-y-5">
      <DropZone onFiles={addFiles} accept=".pdf,application/pdf"
        label="Drop PDF files here" sublabel="Add 2 or more PDFs — drag rows to reorder" />

      {files.length > 0 && (
        <Card>
        <CardContent className="pt-5 space-y-5">

          {/* Sortable list */}
          <div className="space-y-2">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              {files.length} files · {totalPages} pages total
              {files.length > 1 && <span className="ml-2 text-gray-400">· drag ⠿ to reorder</span>}
            </p>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={files.map(f => f.id)} strategy={horizontalListSortingStrategy}>
                <div className="space-y-2">
                  {files.map((file, i) => (
                    <SortableRow key={file.id} file={file} index={i} onRemove={remove} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>

          {/* Visual merge preview */}
          {files.length >= 2 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-xl overflow-x-auto">
              {files.map((f, i) => (
                <div key={f.id} className="flex items-center gap-2 shrink-0">
                  <div className="text-center">
                    <PDFPageThumbnail pdf={f.pdf} pageNumber={1} width={36} />
                    <p className="text-[10px] text-gray-400 mt-0.5 w-9 truncate text-center">{f.pageCount}p</p>
                  </div>
                  {i < files.length - 1 && (
                    <ChevronRight className="w-4 h-4 text-brand-400 shrink-0" />
                  )}
                </div>
              ))}
              {/* Output placeholder */}
              <div className="flex items-center gap-2 shrink-0 border-l border-gray-200 dark:border-gray-700 pl-3 ml-1">
                <div className="w-10 h-14 rounded border-2 border-dashed border-brand-400 flex items-center justify-center">
                  <span className="text-[10px] text-brand-500 font-mono">{totalPages}p</span>
                </div>
              </div>
            </div>
          )}

          {status === 'processing' && <ProgressBar progress={progress} label="Merging PDFs..." />}
          {status === 'error' && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-4 py-3 rounded-xl">{error}</p>
          )}

          <div className="flex gap-3">
            <Button onClick={merge} disabled={files.length < 2 || status === 'processing'}>
              {status === 'processing' ? 'Merging…' : `Merge ${files.length} PDFs → ${totalPages} pages`}
            </Button>
            <Button variant="secondary" onClick={() => { updateFiles(() => []); setOutput([]); setStatus('idle'); }}>
              Reset
            </Button>
          </div>
        </CardContent>
        </Card>
      )}

      {output.length > 0 && <OutputFiles files={output} />}
    </div>
  );
}
