import { Card } from '@/components/ui/card';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useClipboard } from '@mantine/hooks';
import { CopyIcon, CheckIcon, CircleNotchIcon, FileTextIcon, ImageIcon, StackIcon } from '@phosphor-icons/react';
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
        <Card className="p-4 flex items-center gap-3">
          {isPDF ? (
            <div className="w-14 h-14 rounded-lg border border-border bg-secondary flex items-center justify-center shrink-0">
              <FileTextIcon className="w-7 h-7 text-muted-foreground" />
            </div>
          ) : (
            <img src={preview} alt={file.name} className="w-14 h-14 rounded-lg object-cover border border-border shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
            <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={reset}>Change</Button>
        </Card>
      )}

      {file && (
        <Card className="p-5 space-y-5">
          <div>
            <Label>Language</Label>
            <Select value={lang} onValueChange={v => { if (v !== null) setLang(v); }} disabled={status === 'processing'}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map(l => (
                  <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">First run downloads engine assets. Cached after that.</p>
          </div>

          {status === 'processing' && <ProgressBar progress={progress} label="Recognizing text…" />}
          {status === 'error' && (
            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-4 py-3 rounded-xl">{error}</p>
          )}

          <Button onClick={run} disabled={status === 'processing'}>
            {status === 'processing'
              ? <><CircleNotchIcon className="size-4 animate-spin" /> Recognizing…</>
              : <><ImageIcon className="size-4" /> Extract Text</>
            }
          </Button>
        </Card>
      )}

      {status === 'done' && result && (
        <Card className="p-5 space-y-4">
          <Tabs value={resultTab} onValueChange={v => setResultTab(v as ResultTab)}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <TabsList>
                <TabsTrigger value="overlay" className="flex items-center gap-1.5">
                  <StackIcon className="w-3.5 h-3.5" />
                  Overlay
                </TabsTrigger>
                <TabsTrigger value="text" className="flex items-center gap-1.5">
                  <FileTextIcon className="w-3.5 h-3.5" />
                  Text
                </TabsTrigger>
              </TabsList>

              <div className="flex items-center gap-2">
                {result.pages > 1 && (
                  <span className="text-xs text-muted-foreground">{result.pages} pages</span>
                )}
                <Button size="sm" variant="secondary" onClick={() => clipboard.copy(result.text)}>
                  {clipboard.copied
                    ? <><CheckIcon className="size-3.5 text-green-500" /> Copied!</>
                    : <><CopyIcon className="size-3.5" /> Copy all</>
                  }
                </Button>
              </div>
            </div>

            <TabsContent value="overlay">
              {file && (
                <OCROverlay
                  file={file}
                  pageData={result.pageData}
                />
              )}
            </TabsContent>

            <TabsContent value="text">
              {result.text ? (
                <Textarea
                  readOnly
                  value={result.text}
                  rows={14}
                  className="w-full font-mono text-sm resize-y"
                />
              ) : (
                <p className="text-sm text-muted-foreground italic">No text detected.</p>
              )}
            </TabsContent>
          </Tabs>
        </Card>
      )}
    </div>
  );
}
