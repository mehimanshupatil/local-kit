import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useFileSession } from '@/stores/fileStore';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import DropZone from '@/components/shared/DropZone';
import ProgressBar from '@/components/shared/ProgressBar';
import OutputFiles, { type OutputFile } from '@/components/shared/OutputFiles';
import { readPDFMetadata, editPDFMetadata, type PDFMetadata } from '@/lib/pdf/pdfEditMetadata';
import { stripExtension } from '@/lib/utils/fileUtils';
import PDFFileBar from './PDFFileBar';

const BLANK: PDFMetadata = {
  title: '', author: '', subject: '', keywords: '',
  creator: '', producer: '', creationDate: '', modificationDate: '',
};

const FIELDS: { key: keyof PDFMetadata; label: string; placeholder: string; type?: string }[] = [
  { key: 'title',            label: 'Title',             placeholder: 'Document title' },
  { key: 'author',           label: 'Author',            placeholder: 'Author name' },
  { key: 'subject',          label: 'Subject',           placeholder: 'Subject or topic' },
  { key: 'keywords',         label: 'Keywords',          placeholder: 'keyword1, keyword2, ...' },
  { key: 'creator',          label: 'Creator',           placeholder: 'Application that created the PDF' },
  { key: 'producer',         label: 'Producer',          placeholder: 'PDF producer library' },
  { key: 'creationDate',     label: 'Creation Date',     placeholder: '', type: 'date' },
  { key: 'modificationDate', label: 'Modification Date', placeholder: '', type: 'date' },
];

export default function PDFEditMetadataTool() {
  const { sessionFiles, setSessionFiles, clearSession } = useFileSession('pdf');
  const [file,     setFile]     = useState<{ name: string; size: number; buffer: ArrayBuffer } | null>(null);
  const [meta,     setMeta]     = useState<PDFMetadata>(BLANK);
  const [status,   setStatus]   = useState<'idle' | 'loading' | 'processing' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [output,   setOutput]   = useState<OutputFile[]>([]);
  const [error,    setError]    = useState('');

  useEffect(() => {
    if (sessionFiles.length > 0 && !file) {
      try { addFile([sessionFiles[0]]); } catch {}
    }
  }, []);

  const addFile = async ([f]: File[]) => {
    setStatus('loading'); setError(''); setOutput([]);
    try {
      const buf = await f.arrayBuffer();
      const existing = await readPDFMetadata(buf);
      setFile({ name: f.name, size: f.size, buffer: buf });
      setSessionFiles([f]);
      setMeta(existing);
      setStatus('idle');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to read PDF metadata');
      setStatus('error');
    }
  };

  const save = async () => {
    if (!file) return;
    setStatus('processing'); setProgress(0); setError('');
    try {
      setProgress(30);
      const blob = await editPDFMetadata(file.buffer, meta);
      setProgress(100);
      setOutput([{ name: `${stripExtension(file.name)}_meta.pdf`, blob, size: blob.size }]);
      setStatus('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save PDF');
      setStatus('error');
    }
  };

  const clear = () => { setFile(null); setMeta(BLANK); setOutput([]); setStatus('idle'); clearSession(); };

  const set = (key: keyof PDFMetadata) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setMeta(m => ({ ...m, [key]: e.target.value }));

  return (
    <div className="space-y-5">
      {!file ? (
        <DropZone
          onFiles={addFile}
          accept=".pdf,application/pdf"
          multiple={false}
          label="Drop a PDF file"
          sublabel="Existing metadata will be loaded automatically"
        />
      ) : (
        <PDFFileBar file={file} onClear={clear} />
      )}

      {status === 'loading' && <ProgressBar progress={0} label="Reading metadata…" />}

      {file && status !== 'loading' && (
        <Card>
          <CardContent className="pt-5 space-y-4">
            {FIELDS.map(({ key, label, placeholder, type }) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={key}>{label}</Label>
                <Input
                  id={key}
                  type={type ?? 'text'}
                  value={meta[key]}
                  onChange={set(key)}
                  placeholder={placeholder}
                />
              </div>
            ))}

            {status === 'processing' && <ProgressBar progress={progress} label="Saving PDF…" />}
            {status === 'error' && (
              <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-4 py-3 rounded-xl">
                {error}
              </p>
            )}

            <Button onClick={save} disabled={status === 'processing'} className="w-full">
              {status === 'processing' ? 'Saving…' : 'Save PDF'}
            </Button>
          </CardContent>
        </Card>
      )}

      {output.length > 0 && <OutputFiles files={output} />}
    </div>
  );
}
