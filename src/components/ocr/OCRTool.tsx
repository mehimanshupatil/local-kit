import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useClipboard } from '@mantine/hooks';
import { Copy, Check, CircleNotch, FileText, Image, Stack } from '@phosphor-icons/react';
import DropZone from '@/components/shared/DropZone';
import ProgressBar from '@/components/shared/ProgressBar';
import { runOCR, type OCRResult } from '@/lib/ocr/ocr';
import { formatFileSize } from '@/lib/utils/fileUtils';
import OCROverlay from './OCROverlay';

const LANGUAGES = [
  { code: 'eng', label: 'English' },
  { code: 'fra', label: 'French' },
  { code: 'deu', label: 'German' },
  { code: 'spa', label: 'Spanish' },
  { code: 'ita', label: 'Italian' },
  { code: 'por', label: 'Portuguese' },
  { code: 'rus', label: 'Russian' },
  { code: 'chi_sim', label: 'Chinese (Simplified)' },
  { code: 'jpn', label: 'Japanese' },
  { code: 'kor', label: 'Korean' },
  { code: 'ara', label: 'Arabic' },
  { code: 'hin', label: 'Hindi' },
];

type ResultTab = 'text' | 'overlay';

export default function OCRTool() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [lang, setLang] = useState('eng');
  const [status, setStatus] = useState<'idle' | 'processing' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<OCRResult | null>(null);
  const [error, setError] = useState('');
  const [resultTab, setResultTab] = useState<ResultTab>('overlay');


  const clipboard = useClipboard({ timeout: 2000 });
  const isPDF = file?.type === 'application/pdf' || file?.name.endsWith('.pdf');

  const addFile = ([f]: File[]) => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(f.type.startsWith('image/') ? URL.createObjectURL(f) : '');
    setStatus('idle');
    setResult(null);
    setError('');
  };

  const run = async () => {
    if (!file) return;
    setStatus('processing');
    setProgress(0);
    setError('');
    setResult(null);
    try {
      const ocr = await runOCR(file, lang, setProgress);
      setResult(ocr);
      setStatus('done');
      setResultTab('overlay');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'OCR failed');
      setStatus('error');
    }
  };

  const reset = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview('');
    setStatus('idle');
    setResult(null);
    setError('');
  };

  return (
    <div className="space-y-5">
      {!file ? (
        <DropZone
          onFiles={addFile}
          accept="image/*,.pdf,application/pdf"
          multiple={false}
          label="Drop an image or PDF"
          sublabel="JPG, PNG, WebP, PDF — text extracted using Scribe OCR"
        />
      ) : (
        <div className="card p-4 flex items-center gap-3">
          {isPDF ? (
            <div className="w-14 h-14 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
              <FileText className="w-7 h-7 text-gray-400" />
            </div>
          ) : (
            <img src={preview} alt={file.name} className="w-14 h-14 rounded-lg object-cover border border-gray-200 dark:border-gray-700 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{file.name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{formatFileSize(file.size)}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={reset}>Change</Button>
        </div>
      )}

      {file && (
        <div className="card p-5 space-y-5">
          <div>
            <label className="label">Language</label>
            <select
              value={lang}
              onChange={e => setLang(e.target.value)}
              className="input"
              disabled={status === 'processing'}
            >
              {LANGUAGES.map(l => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">First run downloads engine assets. Cached after that.</p>
          </div>

          {status === 'processing' && <ProgressBar progress={progress} label="Recognizing text…" />}
          {status === 'error' && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-4 py-3 rounded-xl">{error}</p>
          )}

          <Button onClick={run} disabled={status === 'processing'}>
            {status === 'processing'
              ? <><CircleNotch className="size-4 animate-spin" /> Recognizing…</>
              : <><Image className="size-4" /> Extract Text</>
            }
          </Button>
        </div>
      )}

      {status === 'done' && result && (
        <div className="card p-5 space-y-4">
          {/* Tab bar */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-sm">
              <button
                onClick={() => setResultTab('overlay')}
                className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${
                  resultTab === 'overlay'
                    ? 'bg-brand-600 text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <Stack className="w-3.5 h-3.5" />
                Overlay
              </button>
              <button
                onClick={() => setResultTab('text')}
                className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors border-l border-gray-200 dark:border-gray-700 ${
                  resultTab === 'text'
                    ? 'bg-brand-600 text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                Text
              </button>
            </div>

            <div className="flex items-center gap-2">
              {result.pages > 1 && (
                <span className="text-xs text-gray-500 dark:text-gray-400">{result.pages} pages</span>
              )}
              <Button size="sm" variant="secondary" onClick={() => clipboard.copy(result.text)}>
                {clipboard.copied
                  ? <><Check className="size-3.5 text-green-500" /> Copied!</>
                  : <><Copy className="size-3.5" /> Copy all</>
                }
              </Button>
            </div>
          </div>

          {/* Overlay tab */}
          {resultTab === 'overlay' && file && (
            <OCROverlay
              file={file}
              pageData={result.pageData}
            />
          )}

          {/* Text tab */}
          {resultTab === 'text' && (
            result.text ? (
              <textarea
                readOnly
                value={result.text}
                rows={14}
                className="input w-full font-mono text-sm resize-y"
              />
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400 italic">No text detected.</p>
            )
          )}
        </div>
      )}
    </div>
  );
}
