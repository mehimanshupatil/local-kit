import { useImmer } from 'use-immer';
import { useToolVisit } from '@/stores/toolVisit';
import { XIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import DropZone from '@/components/shared/DropZone';
import ProgressBar from '@/components/shared/ProgressBar';
import OutputFiles from '@/components/shared/OutputFiles';
import { type ToolOp, IDLE_OP } from '@/lib/utils/toolState';
import { createZip } from '@/lib/archive/createZip';
import { generateId, formatFileSize } from '@/lib/utils/fileUtils';

interface FileEntry {
  id: string;
  name: string;
  size: number;
  file: File;
}

export default function CreateZipTool() {
  useToolVisit('archive', '/archive/create');
  const [files, updateFiles] = useImmer<FileEntry[]>([]);
  const [op, updateOp] = useImmer<ToolOp>({ ...IDLE_OP });
  const { status, progress, output, error } = op;

  const addFiles = (incoming: File[]) => {
    const entries: FileEntry[] = incoming.map(f => ({
      id: generateId(),
      name: f.name,
      size: f.size,
      file: f,
    }));
    updateFiles(draft => { draft.push(...entries); });
    updateOp(() => ({ ...IDLE_OP }));
  };

  const remove = (id: string) =>
    updateFiles(draft => {
      const i = draft.findIndex(f => f.id === id);
      if (i !== -1) draft.splice(i, 1);
    });

  const handleCreate = async () => {
    if (files.length === 0) return;
    updateOp(d => { d.status = 'processing'; d.progress = 0; d.error = ''; });
    try {
      const blob = await createZip(
        files.map(f => f.file),
        pct => updateOp(d => { d.progress = pct; }),
      );
      updateOp(d => {
        d.output = [{ name: 'archive.zip', blob, size: blob.size }];
        d.status = 'done';
      });
    } catch (e) {
      updateOp(d => {
        d.error = e instanceof Error ? e.message : 'Failed to create ZIP';
        d.status = 'error';
      });
    }
  };

  const reset = () => {
    updateFiles(() => []);
    updateOp(() => ({ ...IDLE_OP }));
  };

  const totalSize = files.reduce((s, f) => s + f.size, 0);

  return (
    <div className="space-y-5">
      <DropZone
        onFiles={addFiles}
        label="Drop files here"
        sublabel="Add any files to compress into a ZIP archive"
      />

      {files.length > 0 && (
        <Card>
          <CardContent className="pt-5 space-y-5">
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground mb-3">
                {files.length} {files.length === 1 ? 'file' : 'files'} · {formatFileSize(totalSize)} total
              </p>

              <div className="space-y-1.5">
                {files.map(f => (
                  <div
                    key={f.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border bg-card"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{f.name}</p>
                      <p className="text-xs text-muted-foreground">{formatFileSize(f.size)}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(f.id)}
                      className="shrink-0 text-muted-foreground hover:text-red-500 hover:bg-red-50"
                    >
                      <XIcon className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {status === 'processing' && (
              <ProgressBar progress={progress} label="Creating ZIP..." />
            )}
            {status === 'error' && (
              <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-4 py-3 rounded-xl">
                {error}
              </p>
            )}

            <div className="flex gap-3">
              <Button
                onClick={handleCreate}
                disabled={files.length === 0 || status === 'processing'}
              >
                {status === 'processing'
                  ? 'Creating ZIP…'
                  : `Create ZIP (${files.length} ${files.length === 1 ? 'file' : 'files'})`}
              </Button>
              <Button variant="secondary" onClick={reset}>
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
