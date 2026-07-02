import { useState } from 'react';
import { useImmer } from 'use-immer';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import DropZone from '@/components/shared/DropZone';
import ProgressBar from '@/components/shared/ProgressBar';
import OutputFiles from '@/components/shared/OutputFiles';
import PDFFileBar from './PDFFileBar';
import { useToolVisit } from '@/stores/toolVisit';
import { type ToolOp, IDLE_OP } from '@/lib/utils/toolState';
import { docxToHtml, htmlToPdfBlob } from '@/lib/pdf/wordToPdf';
import { stripExtension } from '@/lib/utils/fileUtils';
import { WarningCircleIcon } from '@phosphor-icons/react';

export default function WordToPdfTool() {
  useToolVisit('pdf', '/pdf/word-to-pdf');

  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const [rawFile, setRawFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [op, updateOp] = useImmer<ToolOp>({ ...IDLE_OP });
  const { status, progress, output, error } = op;

  async function addFile([f]: File[]) {
    if (!f) return;
    setFile({ name: f.name, size: f.size });
    setRawFile(f);
    setPreview('');
    setWarnings([]);
    updateOp(() => ({ ...IDLE_OP }));

    // Generate HTML preview
    updateOp(d => { d.status = 'loading'; });
    try {
      const { html, warnings: w } = await docxToHtml(f);
      setPreview(html);
      setWarnings(w);
      updateOp(() => ({ ...IDLE_OP }));
    } catch (e) {
      updateOp(d => { d.status = 'error'; d.error = e instanceof Error ? e.message : 'Failed to read file'; });
    }
  }

  async function convert() {
    if (!rawFile || !preview) return;
    updateOp(d => { d.status = 'processing'; d.progress = 0; d.error = ''; });
    try {
      const blob = await htmlToPdfBlob(preview, rawFile.name, pct => updateOp(d => { d.progress = pct; }));
      const name = `${stripExtension(rawFile.name)}.pdf`;
      updateOp(d => { d.output = [{ name, blob, size: blob.size }]; d.status = 'done'; });
    } catch (e) {
      updateOp(d => { d.error = e instanceof Error ? e.message : 'Conversion failed'; d.status = 'error'; });
    }
  }

  function clear() {
    setFile(null); setRawFile(null); setPreview(''); setWarnings([]);
    updateOp(() => ({ ...IDLE_OP }));
  }

  return (
    <div className="space-y-5">
      {!file ? (
        <DropZone
          onFiles={addFile}
          accept=".docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
          multiple={false}
          label="Drop a Word document"
          sublabel=".docx or .doc files"
        />
      ) : (
        <PDFFileBar file={file} onClear={clear} />
      )}

      {warnings.length > 0 && (
        <Card>
          <CardContent className="pt-4 pb-3 space-y-1">
            <p className="flex items-center gap-1.5 text-xs font-medium text-amber-500">
              <WarningCircleIcon className="size-4" /> Formatting notes
            </p>
            {warnings.map((w, i) => (
              <p key={i} className="text-xs text-muted-foreground pl-5">{w}</p>
            ))}
          </CardContent>
        </Card>
      )}

      {status === 'loading' && (
        <p className="text-sm text-muted-foreground animate-pulse">Reading document…</p>
      )}

      {status === 'error' && (
        <p className="text-sm text-red-500 bg-red-500/10 px-4 py-3 rounded">{error}</p>
      )}

      {preview && (
        <>
          {/* HTML preview */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wider font-mono">Preview</p>
              <div
                className="bg-white text-black rounded p-8 max-h-[500px] overflow-y-auto text-sm leading-relaxed
                  [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-3
                  [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mb-2
                  [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mb-2
                  [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2
                  [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2
                  [&_table]:border-collapse [&_td]:border [&_td]:border-gray-300 [&_td]:px-2 [&_td]:py-1
                  [&_strong]:font-bold [&_em]:italic"
                dangerouslySetInnerHTML={{ __html: preview }}
              />
            </CardContent>
          </Card>

          {status === 'processing' && <ProgressBar progress={progress} label="Converting to PDF…" />}

          <div className="flex gap-3">
            <Button onClick={convert} disabled={status === 'processing'}>
              {status === 'processing' ? 'Converting…' : 'Convert to PDF'}
            </Button>
            <Button variant="secondary" onClick={clear}>Change file</Button>
          </div>
        </>
      )}

      {output.length > 0 && <OutputFiles files={output} />}
    </div>
  );
}
