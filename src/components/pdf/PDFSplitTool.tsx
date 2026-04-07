import { enableMapSet } from 'immer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { useImmer } from 'use-immer';

enableMapSet();
import { Scissors, X } from 'lucide-react';
import DropZone from '@/components/shared/DropZone';
import ProgressBar from '@/components/shared/ProgressBar';
import OutputFiles, { type OutputFile } from '@/components/shared/OutputFiles';
import PDFPageThumbnail from './PDFPageThumbnail';
import { PDFDocument } from '@cantoo/pdf-lib';
import { loadPDFDocument } from '@/lib/pdf/pdfLoader';
import { stripExtension } from '@/lib/utils/fileUtils';
import { cn } from '@/lib/utils/cn';
import PDFFileBar from './PDFFileBar';
import type { PDFDocumentProxy } from 'pdfjs-dist';

// Section colors for the visual split view
const SECTION_COLORS = [
  'bg-blue-100   dark:bg-blue-950/40   border-blue-300   dark:border-blue-700',
  'bg-purple-100 dark:bg-purple-950/40 border-purple-300 dark:border-purple-700',
  'bg-green-100  dark:bg-green-950/40  border-green-300  dark:border-green-700',
  'bg-amber-100  dark:bg-amber-950/40  border-amber-300  dark:border-amber-700',
  'bg-rose-100   dark:bg-rose-950/40   border-rose-300   dark:border-rose-700',
  'bg-cyan-100   dark:bg-cyan-950/40   border-cyan-300   dark:border-cyan-700',
];
const SECTION_DOTS = ['bg-blue-500', 'bg-purple-500', 'bg-green-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500'];

export default function PDFSplitTool() {
  const [file, setFile]    = useState<{ name: string; size: number; buffer: ArrayBuffer } | null>(null);
  const [pdf,  setPdf]     = useState<PDFDocumentProxy | null>(null);
  const [total, setTotal]  = useState(0);
  // cutPoints: set of page indices AFTER which we cut (0-indexed, so 2 = cut after page 3)
  const [cutPoints, updateCutPoints] = useImmer<Set<number>>(new Set());
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
    updateCutPoints(() => new Set());
    setStatus('idle'); setOutput([]);
  };

  const toggleCut = (afterPage: number) => {
    updateCutPoints(draft => {
      draft.has(afterPage) ? draft.delete(afterPage) : draft.add(afterPage);
    });
  };

  // Compute sections from cut points
  const getSections = (): number[][] => {
    const cuts = Array.from(cutPoints).sort((a, b) => a - b);
    const sections: number[][] = [];
    let start = 0;
    for (const cut of cuts) {
      sections.push(Array.from({ length: cut - start + 1 }, (_, i) => start + i));
      start = cut + 1;
    }
    sections.push(Array.from({ length: total - start }, (_, i) => start + i));
    return sections.filter(s => s.length > 0);
  };

  // Get which section (0-indexed) a page belongs to
  const getSection = (pageIdx: number): number => {
    const sections = getSections();
    for (let s = 0; s < sections.length; s++) {
      if (sections[s].includes(pageIdx)) return s;
    }
    return 0;
  };

  const split = async () => {
    if (!file || !pdf) return;
    setStatus('processing'); setProgress(0); setError('');
    const base = stripExtension(file.name);
    const sections = getSections();
    const results: OutputFile[] = [];
    try {
      const src = await PDFDocument.load(file.buffer);
      for (let s = 0; s < sections.length; s++) {
        const doc = await PDFDocument.create();
        const pages = await doc.copyPages(src, sections[s]);
        pages.forEach(p => doc.addPage(p));
        const bytes = await doc.save();
        const blob = new Blob([bytes], { type: 'application/pdf' });
        results.push({ name: `${base}_part${s + 1}.pdf`, blob, size: blob.size });
        setProgress(Math.round(((s + 1) / sections.length) * 100));
      }
      setOutput(results); setStatus('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Split failed'); setStatus('error');
    }
  };

  const sections = getSections();
  const numOutputs = sections.length;

  return (
    <div className="space-y-5">
      {!file ? (
        <DropZone onFiles={addFile} accept=".pdf,application/pdf" multiple={false}
          label="Drop a PDF file" sublabel="Click between pages to add cut points" />
      ) : (
        <PDFFileBar file={file} total={total} onClear={() => { setFile(null); setPdf(null); setOutput([]); }} />
      )}

      {pdf && total > 0 && (
        <div className="card p-5 space-y-5">

          {/* Instructions */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                Click ✂ between pages to add cut points
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {cutPoints.size === 0 ? 'No cuts — all pages in one file' : `${cutPoints.size} cut${cutPoints.size > 1 ? 's' : ''} → ${numOutputs} output files`}
              </p>
            </div>
            {cutPoints.size > 0 && (
              <Button variant="ghost" size="sm" onClick={() => updateCutPoints(() => new Set())} className="text-gray-400 hover:text-red-500">
                Clear all cuts
              </Button>
            )}
          </div>

          {/* Section legend */}
          {cutPoints.size > 0 && (
            <div className="flex flex-wrap gap-2">
              {sections.map((sec, s) => (
                <div key={s} className="flex items-center gap-1.5 text-xs">
                  <div className={`w-2.5 h-2.5 rounded-full ${SECTION_DOTS[s % SECTION_DOTS.length]}`} />
                  <span className="text-gray-600 dark:text-gray-400">Part {s + 1} ({sec.length} page{sec.length > 1 ? 's' : ''})</span>
                </div>
              ))}
            </div>
          )}

          {/* Page grid with cut points */}
          <div className="overflow-x-auto pb-2">
            <div className="flex items-end gap-0 min-w-max">
              {Array.from({ length: total }, (_, i) => {
                const sec = getSection(i);
                const isLastInSection = cutPoints.has(i);
                const colorCls = SECTION_COLORS[sec % SECTION_COLORS.length];

                return (
                  <div key={i} className="flex items-end gap-0">
                    {/* Page card */}
                    <div className={`flex flex-col items-center p-1.5 rounded-xl border-2 transition-all ${colorCls}`}>
                      {pdf && (
                        <PDFPageThumbnail pdf={pdf} pageNumber={i + 1} width={72} />
                      )}
                      <span className="text-[10px] font-mono text-gray-500 dark:text-gray-400 mt-1">{i + 1}</span>
                    </div>

                    {/* Cut point button (between pages, not after last) */}
                    {i < total - 1 && (
                      <button
                        type="button"
                        onClick={() => toggleCut(i)}
                        title={cutPoints.has(i) ? 'Remove cut' : 'Add cut here'}
                        className={`
                          relative mx-0.5 flex flex-col items-center justify-center group transition-all cursor-pointer
                          ${cutPoints.has(i) ? 'w-8' : 'w-5 hover:w-8'}
                        `}
                        style={{ height: 100 }}
                      >
                        {cutPoints.has(i) ? (
                          <>
                            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 bg-red-400 dark:bg-red-500" />
                            <div className="relative z-10 bg-red-100 dark:bg-red-950 border-2 border-red-400 dark:border-red-500 rounded-full p-1">
                              <Scissors className="w-3.5 h-3.5 text-red-500" />
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px border-l-2 border-dashed border-gray-300 dark:border-gray-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity relative z-10 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-full p-1">
                              <Scissors className="w-3 h-3 text-gray-400" />
                            </div>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Output preview */}
          {cutPoints.size > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {sections.map((sec, s) => (
                <div key={s} className={`p-3 rounded-xl border-2 ${SECTION_COLORS[s % SECTION_COLORS.length]}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-2 h-2 rounded-full ${SECTION_DOTS[s % SECTION_DOTS.length]}`} />
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Part {s + 1}.pdf</span>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {sec.slice(0, 4).map(p => (
                      pdf && <PDFPageThumbnail key={p} pdf={pdf} pageNumber={p + 1} width={36} />
                    ))}
                    {sec.length > 4 && <span className="text-xs text-gray-400 self-center">+{sec.length - 4}</span>}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1.5">
                    Pages {sec[0] + 1}–{sec[sec.length - 1] + 1} ({sec.length} page{sec.length > 1 ? 's' : ''})
                  </p>
                </div>
              ))}
            </div>
          )}

          {status === 'processing' && <ProgressBar progress={progress} label="Splitting PDF..." />}
          {status === 'error' && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-4 py-3 rounded-xl">{error}</p>}

          <Button onClick={split} disabled={status === 'processing'} >
            {status === 'processing' ? 'Splitting...' : cutPoints.size === 0 ? 'Export as single PDF' : `Split into ${numOutputs} PDFs`}
          </Button>
        </div>
      )}

      {output.length > 0 && <OutputFiles files={output} />}
    </div>
  );
}
