import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { useState, useEffect } from 'react';
import { useImmer } from 'use-immer';
import DropZone from '@/components/shared/DropZone';
import ProgressBar from '@/components/shared/ProgressBar';
import OutputFiles from '@/components/shared/OutputFiles';
import { readMetadata, removeMetadata, type MetadataSummary } from '@/lib/image/imageRemoveMetadata';
import { formatFileSize, stripExtension, getExtension } from '@/lib/utils/fileUtils';
import { useToolVisit } from '@/stores/toolVisit';
import { type ToolOp, IDLE_OP } from '@/lib/utils/toolState';

export default function ImageRemoveMetadataTool() {
  const { sessionFiles, setSessionFiles, clearSession } = useToolVisit('image', '/image/remove-metadata');
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<MetadataSummary | null>(null);
  const [reading, setReading] = useState(false);
  const [op, updateOp] = useImmer<ToolOp>({ ...IDLE_OP });
  const { status, progress, output, error } = op;

  const handleFiles = (incoming: File[]) => {
    const f = incoming[0];
    if (!f) return;
    setFile(f);
    setSessionFiles([f]);
    setSummary(null);
    updateOp(() => ({ ...IDLE_OP }));
  };

  // Seed from session on mount
  useEffect(() => {
    if (sessionFiles.length > 0 && !file) { handleFiles([sessionFiles[0]]); }
  }, []);

  // Auto-read metadata when file changes
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    setReading(true);
    readMetadata(file).then(result => {
      if (!cancelled) {
        setSummary(result);
        setReading(false);
      }
    });
    return () => { cancelled = true; };
  }, [file]);

  const handleRemove = async () => {
    if (!file) return;
    updateOp(d => { d.status = 'processing'; d.progress = 0; d.error = ''; });
    try {
      const blob = await removeMetadata(file, (pct) => updateOp(d => { d.progress = pct; }));
      const ext = getExtension(file.name) || (file.type === 'image/png' ? 'png' : 'jpg');
      const name = `${stripExtension(file.name)}_clean.${ext}`;
      updateOp(d => { d.output = [{ name, blob, size: blob.size }]; d.status = 'done'; });
    } catch (e) {
      updateOp(d => { d.error = e instanceof Error ? e.message : 'Failed to remove metadata'; d.status = 'error'; });
    }
  };

  const reset = () => {
    setFile(null);
    setSummary(null);
    updateOp(() => ({ ...IDLE_OP }));
    clearSession();
  };

  return (
    <div className="space-y-5">
      <DropZone
        onFiles={handleFiles}
        accept="image/jpeg,image/jpg,image/png,image/webp"
        multiple={false}
        label="Drop an image here"
        sublabel="JPEG, PNG, WebP supported"
      />

      {file && (
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground text-sm truncate max-w-xs">{file.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{formatFileSize(file.size)}</p>
            </div>
            <Button variant="secondary" onClick={reset} className="text-xs">Clear</Button>
          </div>

          {reading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <svg className="animate-spin size-4 shrink-0 text-brand-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Reading metadata…
            </div>
          )}

          {summary && !reading && (
            <div className="space-y-2">
              {summary.fields.length > 0 ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-amber-500/15 text-amber-500 text-xs font-medium px-2.5 py-0.5">
                      {summary.fields.length} metadata field{summary.fields.length !== 1 ? 's' : ''} found
                    </span>
                  </div>
                  <div className="overflow-auto max-h-64 rounded-xl border border-border">
                    <Table className="text-xs">
                      <TableHeader className="bg-secondary sticky top-0">
                        <TableRow>
                          <TableHead className="w-1/3 text-muted-foreground">Field</TableHead>
                          <TableHead className="text-muted-foreground">Value</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {summary.fields.map(({ key, value }) => (
                          <TableRow key={key}>
                            <TableCell className="text-muted-foreground font-mono break-all whitespace-normal">{key}</TableCell>
                            <TableCell className="text-foreground break-all whitespace-normal">{value}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground bg-secondary rounded-xl px-4 py-3">
                  No metadata found in this image.
                </p>
              )}
            </div>
          )}

          {status === 'processing' && <ProgressBar progress={progress} label="Stripping metadata…" />}
          {status === 'error' && (
            <p className="text-sm text-red-500 bg-red-500/10 px-4 py-3 rounded-xl">{error}</p>
          )}

          <div className="flex gap-3">
            <Button onClick={handleRemove} disabled={status === 'processing' || reading}>
              {status === 'processing' ? 'Removing…' : 'Remove & Download'}
            </Button>
            <Button variant="secondary" onClick={reset}>Reset</Button>
          </div>
        </Card>
      )}

      {output.length > 0 && <OutputFiles files={output} />}
    </div>
  );
}
