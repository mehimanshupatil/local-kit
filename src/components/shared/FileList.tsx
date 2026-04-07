import { formatFileSize } from '@/lib/utils/fileUtils';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

interface FileItem {
  id: string;
  name: string;
  size: number;
  preview?: string;
}

interface Props {
  files: FileItem[];
  onRemove: (id: string) => void;
  onReorder?: (from: number, to: number) => void;
}

export default function FileList({ files, onRemove }: Props) {
  if (files.length === 0) return null;

  return (
    <div className="space-y-2">
      {files.map((file, i) => (
        <div
          key={file.id}
          className="flex items-center gap-3 px-4 py-3 card rounded-xl border border-gray-200 dark:border-gray-800 animate-fade-in"
        >
          <span className="text-gray-400 dark:text-gray-600 text-sm font-mono w-6 text-center">{i + 1}</span>
          {file.preview && (
            <img src={file.preview} alt={file.name} className="w-10 h-10 object-cover rounded-lg border border-gray-200 dark:border-gray-700" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{file.name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{formatFileSize(file.size)}</p>
          </div>
          <Button
            onClick={() => onRemove(file.id)}
            variant="ghost"
            size="icon"
            className="text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
            aria-label="Remove file"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}
