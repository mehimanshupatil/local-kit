import { useDropzone } from 'react-dropzone';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';

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
  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop: onFiles,
    accept: parseAccept(accept),
    multiple,
  });

  return (
    <div
      {...getRootProps({
        className: cn(
          'flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed',
          'py-12 px-6 text-center transition-all duration-200 select-none outline-none',
          isDragActive && !isDragReject && 'border-brand-500 bg-brand-50 dark:bg-brand-950/30',
          isDragReject && 'border-red-400 bg-red-50 dark:bg-red-950/30',
          !isDragActive && 'border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900',
        ),
      })}
    >
      <input {...getInputProps()} />

      <div className={cn(
        'flex items-center justify-center w-14 h-14 rounded-2xl transition-all duration-200',
        isDragActive && !isDragReject && 'bg-brand-100 dark:bg-brand-900/50 scale-110',
        isDragReject && 'bg-red-100 dark:bg-red-900/50',
        !isDragActive && 'bg-gray-100 dark:bg-gray-800',
      )}>
        <Upload className={cn(
          'w-6 h-6 transition-colors',
          isDragActive && !isDragReject && 'text-brand-600 dark:text-brand-400',
          isDragReject && 'text-red-500',
          !isDragActive && 'text-gray-400 dark:text-gray-500',
        )} />
      </div>

      <div className="space-y-1">
        <p className="font-semibold text-gray-800 dark:text-gray-200">
          {isDragReject ? 'File type not supported' : isDragActive ? 'Drop to add files' : label || 'Drop files here'}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {sublabel || (accept ? `Accepted: ${accept}` : 'All file types supported')}
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
