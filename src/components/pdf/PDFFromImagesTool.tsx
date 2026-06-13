import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import { useImmer } from 'use-immer';
import { useFileSession } from '@/stores/fileStore';
import { useRecentTools } from '@/stores/prefsStore';
import DropZone from '@/components/shared/DropZone';
import FileList from '@/components/shared/FileList';
import ProgressBar from '@/components/shared/ProgressBar';
import OutputFiles from '@/components/shared/OutputFiles';
import { type ToolOp, IDLE_OP } from '@/lib/utils/toolState';
import { imagesToPDF } from '@/lib/pdf/pdfFromImages';
import { generateId } from '@/lib/utils/fileUtils';

interface FileEntry { id: string; name: string; size: number; buffer: ArrayBuffer; type: string; preview: string; rawFile: File }

export default function PDFFromImagesTool() {
  const { sessionFiles, setSessionFiles, clearSession } = useFileSession('pdf');
  const { recordVisit } = useRecentTools();
  useEffect(() => { recordVisit('/pdf/from-images'); }, []);
  const [files, updateFiles] = useImmer<FileEntry[]>([]);
  const [op, updateOp] = useImmer<ToolOp>({ ...IDLE_OP });
  const { status, progress, output, error } = op;

  useEffect(() => {
    if (sessionFiles.length > 0 && files.length === 0) {
      try { addFiles(sessionFiles); } catch {}
    }
  }, []);

  useEffect(() => {
    setSessionFiles(files.map(f => f.rawFile));
  }, [files]);

  const addFiles = async (incoming: File[]) => {
    const entries = await Promise.all(
      incoming.filter(f => f.type.startsWith('image/')).map(async f => ({
        id: generateId(), name: f.name, size: f.size, type: f.type,
        buffer: await f.arrayBuffer(), preview: URL.createObjectURL(f), rawFile: f,
      }))
    );
    updateFiles(draft => { draft.push(...entries); });
    updateOp(() => ({ ...IDLE_OP }));
  };

  const remove = (id: string) => {
    const f = files.find(f => f.id === id);
    if (f) URL.revokeObjectURL(f.preview);
    updateFiles(draft => { const i = draft.findIndex(f => f.id === id); if (i !== -1) draft.splice(i, 1); });
  };

  const convert = async () => {
    if (files.length === 0) return;
    updateOp(d => { d.status = 'processing'; d.progress = 0; d.error = ''; });
    try {
      const blob = await imagesToPDF(files.map(f => ({ buffer: f.buffer, type: f.type })), pct => updateOp(d => { d.progress = pct; }));
      updateOp(d => { d.output = [{ name: 'images.pdf', blob, size: blob.size }]; d.status = 'done'; });
    } catch (e) {
      updateOp(d => { d.error = e instanceof Error ? e.message : 'Conversion failed'; d.status = 'error'; });
    }
  };

  return (
    <div className="space-y-5">
      <DropZone onFiles={addFiles} accept="image/*" label="Drop images here" sublabel="JPG, PNG images will be combined into a PDF" />

      {files.length > 0 && (
        <div className="card p-5 space-y-4">
          <FileList files={files.map(f => ({ id: f.id, name: f.name, size: f.size, preview: f.preview }))} onRemove={remove} />

          {status === 'processing' && <ProgressBar progress={progress} label="Creating PDF..." />}
          {status === 'error' && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-4 py-3 rounded-xl">{error}</p>}

          <div className="flex gap-3">
            <Button onClick={convert} disabled={files.length === 0 || status === 'processing'} >
              {status === 'processing' ? 'Creating PDF...' : `Create PDF from ${files.length} image${files.length > 1 ? 's' : ''}`}
            </Button>
            <Button variant="secondary" onClick={() => { files.forEach(f => URL.revokeObjectURL(f.preview)); updateFiles(() => []); updateOp(() => ({ ...IDLE_OP })); clearSession(); }} >Reset</Button>
          </div>
        </div>
      )}

      {output.length > 0 && <OutputFiles files={output} />}
    </div>
  );
}
