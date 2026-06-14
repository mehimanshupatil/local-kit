import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import { useImmer } from 'use-immer';
import DropZone from '@/components/shared/DropZone';
import ProgressBar from '@/components/shared/ProgressBar';
import OutputFiles from '@/components/shared/OutputFiles';
import { compressPDF } from '@/lib/pdf/pdfCompress';
import { formatFileSize } from '@/lib/utils/fileUtils';
import PDFFileBar from './PDFFileBar';
import { useToolVisit } from '@/stores/toolVisit';
import { type ToolOp, IDLE_OP } from '@/lib/utils/toolState';

export default function PDFCompressTool() {
  const { sessionFiles, setSessionFiles, clearSession } = useToolVisit('pdf', '/pdf/compress');
  const [file, setFile] = useState<{ name: string; size: number; buffer: ArrayBuffer } | null>(null);
  const [op, updateOp] = useImmer<ToolOp>({ ...IDLE_OP });
  const { status, progress, output, error } = op;
  const [stats, setStats] = useState<{ original: number; compressed: number } | null>(null);

  useEffect(() => {
    if (sessionFiles.length > 0 && !file) {
      try { addFile([sessionFiles[0]]); } catch {}
    }
  }, []);

  const addFile = async ([f]: File[]) => {
    setFile({ name: f.name, size: f.size, buffer: await f.arrayBuffer() });
    setSessionFiles([f]);
    updateOp(() => ({ ...IDLE_OP })); setStats(null);
  };

  const compress = async () => {
    if (!file) return;
    updateOp(d => { d.status = 'processing'; d.progress = 0; d.error = ''; });
    try {
      const result = await compressPDF(file.buffer, file.name, pct => updateOp(d => { d.progress = pct; }));
      setStats({ original: result.originalSize, compressed: result.newSize });
      updateOp(d => { d.output = [{ name: result.name, blob: result.blob, size: result.newSize }]; d.status = 'done'; });
    } catch (e) {
      updateOp(d => { d.error = e instanceof Error ? e.message : 'Failed to compress'; d.status = 'error'; });
    }
  };

  const savingPct = stats ? Math.round((1 - stats.compressed / stats.original) * 100) : 0;

  return (
    <div className="space-y-5">
      {!file ? (
        <DropZone onFiles={addFile} accept=".pdf,application/pdf" multiple={false} label="Drop a PDF file" />
      ) : (
        <PDFFileBar file={file} onClear={() => { setFile(null); updateOp(() => ({ ...IDLE_OP })); setStats(null); clearSession(); }} />
      )}

      {file && (
        <div className="card p-5 space-y-4">
          {stats && (
            <div className="flex gap-4 p-4 bg-green-50 dark:bg-green-950/30 rounded-xl border border-green-200 dark:border-green-900">
              <div className="text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400">Original</p>
                <p className="font-semibold text-gray-900 dark:text-white">{formatFileSize(stats.original)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400">Compressed</p>
                <p className="font-semibold text-green-700 dark:text-green-400">{formatFileSize(stats.compressed)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400">Saved</p>
                <p className="font-semibold text-green-700 dark:text-green-400">{savingPct}%</p>
              </div>
            </div>
          )}

          {status === 'processing' && <ProgressBar progress={progress} label="Compressing PDF..." />}
          {status === 'error' && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-4 py-3 rounded-xl">{error}</p>}

          <Button onClick={compress} disabled={status === 'processing'} >
            {status === 'processing' ? 'Compressing...' : 'Compress PDF'}
          </Button>
        </div>
      )}

      {output.length > 0 && <OutputFiles files={output} />}
    </div>
  );
}
