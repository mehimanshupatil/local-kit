import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import DropZone from '@/components/shared/DropZone';
import ProgressBar from '@/components/shared/ProgressBar';
import OutputFiles, { type OutputFile } from '@/components/shared/OutputFiles';
import { readMetadata, removeMetadata, type MetadataSummary } from '@/lib/image/imageRemoveMetadata';
import { formatFileSize, stripExtension, getExtension } from '@/lib/utils/fileUtils';
import { useFileSession } from '@/stores/fileStore';

export default function ImageRemoveMetadataTool() {
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<MetadataSummary | null>(null);
  const [reading, setReading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'processing' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [output, setOutput] = useState<OutputFile[]>([]);
  const [error, setError] = useState('');
  const { sessionFiles, setSessionFiles, clearSession } = useFileSession('image');

  const handleFiles = (incoming: File[]) => {
    const f = incoming[0];
    if (!f) return;
    setFile(f);
    setSessionFiles([f]);
    setSummary(null);
    setOutput([]);
    setStatus('idle');
    setError('');
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
    setStatus('processing');
    setProgress(0);
    setError('');
    try {
      const blob = await removeMetadata(file, setProgress);
      const ext = getExtension(file.name) || (file.type === 'image/png' ? 'png' : 'jpg');
      const name = `${stripExtension(file.name)}_clean.${ext}`;
      setOutput([{ name, blob, size: blob.size }]);
      setStatus('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove metadata');
      setStatus('error');
    }
  };

  const reset = () => {
    setFile(null);
    setSummary(null);
    setOutput([]);
    setStatus('idle');
    setError('');
    setProgress(0);
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
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900 dark:text-white text-sm truncate max-w-xs">{file.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">{formatFileSize(file.size)}</p>
            </div>
            <Button variant="secondary" onClick={reset} className="text-xs">Clear</Button>
          </div>

          {reading && (
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
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
                    <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 text-xs font-medium px-2.5 py-0.5">
                      {summary.fields.length} metadata field{summary.fields.length !== 1 ? 's' : ''} found
                    </span>
                  </div>
                  <div className="overflow-auto max-h-64 rounded-xl border border-gray-200 dark:border-gray-700">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-300 w-1/3">Field</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-300">Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {summary.fields.map(({ key, value }) => (
                          <tr key={key} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                            <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400 font-mono break-all">{key}</td>
                            <td className="px-3 py-1.5 text-gray-800 dark:text-gray-200 break-all">{value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-xl px-4 py-3">
                  No metadata found in this image.
                </p>
              )}
            </div>
          )}

          {status === 'processing' && <ProgressBar progress={progress} label="Stripping metadata…" />}
          {status === 'error' && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-4 py-3 rounded-xl">{error}</p>
          )}

          <div className="flex gap-3">
            <Button onClick={handleRemove} disabled={status === 'processing' || reading}>
              {status === 'processing' ? 'Removing…' : 'Remove & Download'}
            </Button>
            <Button variant="secondary" onClick={reset}>Reset</Button>
          </div>
        </div>
      )}

      {output.length > 0 && <OutputFiles files={output} />}
    </div>
  );
}
