import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { downloadBlob, downloadAllAsZip } from '@/lib/utils/downloadUtils';
import { formatFileSize } from '@/lib/utils/fileUtils';
import { DownloadSimple, Archive, Eye, EyeSlash, Copy, Check } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useDisclosure, useTimeout } from '@mantine/hooks';

export interface OutputFile {
  name: string;
  blob: Blob;
  size: number;
}

interface Props {
  files: OutputFile[];
}

function PDFPreview({ blob }: { blob: Blob }) {
  const [url, setUrl] = useState('');
  const [opened, { toggle }] = useDisclosure(false);

  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);

  return (
    <div className="mt-2 space-y-2">
      <Button variant="secondary" size="sm" onClick={toggle}>
        {opened ? <EyeSlash className="size-3.5" /> : <Eye className="size-3.5" />}
        {opened ? 'Hide preview' : 'Preview PDF'}
      </Button>
      {opened && url && (
        <iframe
          src={url}
          className="w-full rounded-xl border border-gray-200 dark:border-gray-700"
          style={{ height: 600 }}
          title="PDF preview"
        />
      )}
    </div>
  );
}

function ImagePreview({ blob }: { blob: Blob }) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);

  if (!url) return null;
  return (
    <div className="w-16 h-16 rounded-lg shrink-0 border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-700 flex items-center justify-center overflow-hidden">
      <img
        src={url}
        alt="preview"
        className="max-w-full max-h-full object-contain"
      />
    </div>
  );
}

function CopyImageButton({ blob }: { blob: Blob }) {
  const [copied, setCopied] = useState(false);
  const [copiedSize, setCopiedSize] = useState<number | null>(null);
  const { start: startResetTimer } = useTimeout(() => { setCopied(false); setCopiedSize(null); }, 2000);

  const mimeType = blob.type || 'image/png';
  const willConvert = !(ClipboardItem.supports?.(mimeType) ?? false) && mimeType !== 'image/png';

  const copy = async () => {
    try {
      const supported = !willConvert;

      const clipBlob = supported ? blob : await new Promise<Blob>((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(blob);
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          canvas.getContext('2d')!.drawImage(img, 0, 0);
          URL.revokeObjectURL(url);
          canvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas toBlob failed')), 'image/png');
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
        img.src = url;
      });

      await navigator.clipboard.write([new ClipboardItem({ [supported ? mimeType : 'image/png']: clipBlob })]);
      setCopied(true);
      setCopiedSize(clipBlob.size);
      startResetTimer();
    } catch {
      // Clipboard API unsupported or denied — silently ignore
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="secondary" onClick={copy} title="Copy image to clipboard">
        {copied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
        {copied ? `Copied! (${formatFileSize(copiedSize!)})` : 'Copy'}
      </Button>
      {willConvert && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          ⚠ Will copy as PNG — browser doesn't support {mimeType.split('/')[1].toUpperCase()} in clipboard, this can affect size
        </p>
      )}
    </div>
  );
}

export default function OutputFiles({ files }: Props) {
  if (files.length === 0) return null;

  const isImage = (file: OutputFile) => file.blob.type.startsWith('image/');
  const isPDF = (file: OutputFile) => file.blob.type === 'application/pdf' || file.name.endsWith('.pdf');

  return (
    <Card className="animate-slide-up">
      <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
        <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <span>✅</span> Output ({files.length} {files.length === 1 ? 'file' : 'files'})
        </h3>
        {files.length > 1 && (
          <Button size="sm" onClick={() => downloadAllAsZip(files)}>
            <Archive className="size-3.5" />
            Download All (.zip)
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {files.map((file, i) => (
          <div key={i} className="px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800">
            <div className="flex items-center gap-3">
              {isImage(file) && <ImagePreview blob={file.blob} />}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
              </div>
              {isImage(file) && <CopyImageButton blob={file.blob} />}
              <Button size="sm" onClick={() => downloadBlob(file.blob, file.name)}>
                <DownloadSimple className="size-3.5" />
                Download
              </Button>
            </div>
            {isPDF(file) && <PDFPreview blob={file.blob} />}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
