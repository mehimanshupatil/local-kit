import { useState } from 'react';
import { useImmer } from 'use-immer';
import { useToolVisit } from '@/stores/toolVisit';
import { DownloadSimpleIcon, ArchiveIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import DropZone from '@/components/shared/DropZone';
import { loadZip, type ZipEntry } from '@/lib/archive/extractZip';
import { downloadBlob } from '@/lib/utils/downloadUtils';
// @ts-ignore
import JSZip from 'jszip';

interface State {
  status: 'idle' | 'loading' | 'ready' | 'error';
  entries: ZipEntry[];
  error: string;
  zipName: string;
}

const IDLE_STATE: State = { status: 'idle', entries: [], error: '', zipName: '' };

export default function ExtractZipTool() {
  useToolVisit('archive', '/archive/extract');
  const [state, updateState] = useImmer<State>({ ...IDLE_STATE });
  const [downloading, setDownloading] = useState<string | null>(null);
  const [bulkDownloading, setBulkDownloading] = useState(false);

  const handleFiles = async (files: File[]) => {
    const zipFile = files.find(f => f.name.endsWith('.zip') || f.type === 'application/zip');
    if (!zipFile) return;

    updateState(d => { d.status = 'loading'; d.error = ''; d.entries = []; d.zipName = zipFile.name; });
    try {
      const entries = await loadZip(zipFile);
      updateState(d => { d.status = 'ready'; d.entries = entries; });
    } catch (e) {
      updateState(d => {
        d.status = 'error';
        d.error = e instanceof Error ? e.message : 'Failed to read ZIP file';
      });
    }
  };

  const downloadEntry = async (entry: ZipEntry) => {
    setDownloading(entry.name);
    try {
      const blob = await entry.blob();
      const filename = entry.name.includes('/') ? entry.name.split('/').pop()! : entry.name;
      downloadBlob(blob, filename);
    } finally {
      setDownloading(null);
    }
  };

  const downloadAll = async () => {
    setBulkDownloading(true);
    try {
      const zip = new JSZip();
      for (const entry of state.entries) {
        const blob = await entry.blob();
        zip.file(entry.name, blob);
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const baseName = state.zipName.replace(/\.zip$/i, '');
      downloadBlob(blob, `${baseName}-extracted.zip`);
    } finally {
      setBulkDownloading(false);
    }
  };

  const reset = () => updateState(() => ({ ...IDLE_STATE }));

  const { status, entries, error } = state;

  return (
    <div className="space-y-5">
      <DropZone
        onFiles={handleFiles}
        accept=".zip,application/zip"
        multiple={false}
        label="Drop a ZIP file here"
        sublabel="Load a .zip file to browse and extract its contents"
      />

      {status === 'loading' && (
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground animate-pulse">Reading ZIP file…</p>
          </CardContent>
        </Card>
      )}

      {status === 'error' && (
        <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-4 py-3 rounded-xl">
          {error}
        </p>
      )}

      {status === 'ready' && entries.length > 0 && (
        <Card className="animate-slide-up">
          <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
            <h3 className="font-semibold text-foreground">
              {entries.length} {entries.length === 1 ? 'file' : 'files'} in archive
            </h3>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={downloadAll}
                disabled={bulkDownloading}
              >
                <ArchiveIcon className="size-3.5" />
                {bulkDownloading ? 'Packaging…' : 'Download All as ZIP'}
              </Button>
              <Button size="sm" variant="ghost" onClick={reset}>
                Clear
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {entries.map((entry, i) => {
              const displayName = entry.name.includes('/')
                ? entry.name
                : entry.name;
              const isDownloadingThis = downloading === entry.name;
              return (
                <div
                  key={i}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-secondary"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate font-mono">
                      {displayName}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => downloadEntry(entry)}
                    disabled={isDownloadingThis || bulkDownloading}
                    className="shrink-0"
                  >
                    <DownloadSimpleIcon className="size-3.5" />
                    {isDownloadingThis ? 'Extracting…' : 'Download'}
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {status === 'ready' && entries.length === 0 && (
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">The ZIP archive is empty.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
