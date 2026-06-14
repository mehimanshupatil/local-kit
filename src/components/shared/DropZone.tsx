import { useDropzone } from 'react-dropzone';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { UploadIcon } from '@phosphor-icons/react';
import { useWindowEvent } from '@mantine/hooks';

interface Props {
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  label?: string;
  sublabel?: string;
}

function parseAccept(accept?: string): Record<string, string[]> | undefined {
  if (!accept) return undefined;
  const result: Record<string, string[]> = {};
  accept.split(',').map(s => s.trim()).forEach(token => {
    if (token.startsWith('.')) {
      result['application/octet-stream'] = result['application/octet-stream'] ?? [];
      const mimes: Record<string, string> = {
        '.pdf': 'application/pdf',
        '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
        '.avi': 'video/x-msvideo', '.mkv': 'video/x-matroska',
      };
      const mime = mimes[token];
      if (mime) { result[mime] = result[mime] ?? []; }
      else { result['application/octet-stream']!.push(token); }
    } else {
      result[token] = result[token] ?? [];
    }
  });
  return result;
}

export default function DropZone({ onFiles, accept, multiple = true, label, sublabel }: Props) {
  const acceptsImages = !accept || accept.includes('image');

  useWindowEvent('paste', (e) => {
    if (!acceptsImages) return;
    const items = Array.from(e.clipboardData?.items ?? []);
    const files = items
      .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
      .map(item => item.getAsFile())
      .filter((f): f is File => f !== null);
    if (files.length === 0) return;
    onFiles(multiple ? files : [files[0]]);
  });

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop: onFiles,
    accept: parseAccept(accept),
    multiple,
  });

  return (
    <div
      {...getRootProps({
        className: cn(
          'flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed',
          'py-12 px-6 text-center transition-all duration-200 select-none outline-none',
          isDragActive && !isDragReject && 'border-brand-500 bg-brand-500/10',
          isDragReject && 'border-red-400 bg-red-50 dark:bg-red-950/30',
          !isDragActive && 'border-border bg-card',
        ),
      })}
    >
      <input {...getInputProps()} />

      <div className={cn(
        'flex items-center justify-center w-14 h-14 rounded-xl transition-all duration-200',
        isDragActive && !isDragReject && 'bg-brand-100 dark:bg-brand-900/50 scale-110',
        isDragReject && 'bg-red-100 dark:bg-red-900/50',
        !isDragActive && 'bg-secondary',
      )}>
        <UploadIcon className={cn(
          'w-6 h-6 transition-colors',
          isDragActive && !isDragReject && 'text-brand-500',
          isDragReject && 'text-red-500',
          !isDragActive && 'text-muted-foreground',
        )} />
      </div>

      <div className="space-y-1">
        <p className="font-semibold text-foreground">
          {isDragReject ? 'File type not supported' : isDragActive ? 'Drop to add files' : label || 'Drop files here'}
        </p>
        <p className="text-sm text-muted-foreground">
          {sublabel || (accept ? `Accepted: ${accept}` : 'All file types supported')}
          {acceptsImages && <span className="ml-1 opacity-60">· or paste (Ctrl+V)</span>}
        </p>
      </div>

      {!isDragActive && !isDragReject && (
        <Button type="button" size="sm" className="mt-1">
          Browse files
        </Button>
      )}
    </div>
  );
}
