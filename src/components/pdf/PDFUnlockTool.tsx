import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { Lock, LockOpen, Eye, EyeOff } from 'lucide-react';
import DropZone from '@/components/shared/DropZone';
import ProgressBar from '@/components/shared/ProgressBar';
import OutputFiles, { type OutputFile } from '@/components/shared/OutputFiles';
import { isEncrypted, unlockPDF } from '@/lib/pdf/pdfUnlock';
import { formatFileSize, stripExtension } from '@/lib/utils/fileUtils';

export default function PDFUnlockTool() {
  const [file, setFile]         = useState<{ name: string; size: number; buffer: ArrayBuffer } | null>(null);
  const [isLocked, setIsLocked] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [status, setStatus]     = useState<'idle' | 'processing' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [output, setOutput]     = useState<OutputFile[]>([]);
  const [error, setError]       = useState('');

  const addFile = async ([f]: File[]) => {
    const buffer = await f.arrayBuffer();
    setFile({ name: f.name, size: f.size, buffer });
    setPassword('');
    setStatus('idle');
    setOutput([]);
    setError('');
    setIsLocked(null);

    try {
      const locked = await isEncrypted(buffer.slice(0));
      setIsLocked(locked);
    } catch {
      setIsLocked(null);
    }
  };

  const unlock = async () => {
    if (!file) return;
    setStatus('processing');
    setProgress(30);
    setError('');
    try {
      const blob = await unlockPDF(file.buffer.slice(0), password);
      setProgress(100);
      const base = stripExtension(file.name);
      setOutput([{ name: `${base}_unlocked.pdf`, blob, size: blob.size }]);
      setStatus('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to unlock. Check your password.');
      setStatus('error');
      setProgress(0);
    }
  };

  return (
    <div className="space-y-5">
      {!file ? (
        <DropZone
          onFiles={addFile}
          accept=".pdf,application/pdf"
          multiple={false}
          label="Drop a PDF file"
          sublabel="Upload a password-protected PDF to unlock it"
        />
      ) : (
        <div className="flex items-center gap-3 px-4 py-3 card rounded-xl border">
          <span className="text-2xl">📄</span>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{file.name}</p>
            <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
          </div>
          <Button variant="secondary"
            onClick={() => { setFile(null); setIsLocked(null); setOutput([]); setStatus('idle'); setError(''); }}
            className="text-xs py-1.5 px-3 shrink-0"
          >
            Change
          </Button>
        </div>
      )}

      {file && (
        <div className="card p-5 space-y-5">
          {/* Encryption status */}
          {isLocked === false && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
              <LockOpen className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0" />
              <p className="text-sm text-green-700 dark:text-green-300 font-medium">
                This PDF is not password protected
              </p>
            </div>
          )}

          {isLocked === true && (
            <>
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <Lock className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
                <p className="text-sm text-amber-700 dark:text-amber-300 font-medium">
                  This PDF is password protected — enter the password to unlock it
                </p>
              </div>

              <div>
                <label className="label">Password</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && password && unlock()}
                    placeholder="Enter PDF password"
                    className="input pr-10"
                    autoComplete="off"
                  />
                  <Button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    tabIndex={-1}
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </>
          )}

          {isLocked === null && file && (
            <div className="px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-500 dark:text-gray-400">Checking encryption status…</p>
            </div>
          )}

          {status === 'processing' && <ProgressBar progress={progress} label="Unlocking PDF..." />}
          {status === 'error' && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-4 py-3 rounded-xl">
              {error}
            </p>
          )}

          {isLocked === true && (
            <Button
              onClick={unlock}
              disabled={!password || status === 'processing'}
              
            >
              {status === 'processing' ? 'Unlocking…' : 'Unlock PDF'}
            </Button>
          )}

          {/* Divider */}
          <div className="border-t border-gray-100 dark:border-gray-800 pt-5 space-y-3">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Protect PDF</p>
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
              <Lock className="w-4 h-4 text-blue-500 dark:text-blue-400 mt-0.5 shrink-0" />
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Password protection requires encryption which is not available in-browser. Use a desktop tool like{' '}
                <span className="font-medium">Adobe Acrobat</span> or{' '}
                <span className="font-medium">LibreOffice</span>.
              </p>
            </div>
          </div>
        </div>
      )}

      {output.length > 0 && <OutputFiles files={output} />}
    </div>
  );
}
