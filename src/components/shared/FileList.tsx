import { formatFileSize } from '@/lib/utils/fileUtils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { XIcon } from '@phosphor-icons/react';

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
        <Card
          key={file.id}
          className="flex flex-row items-center gap-3 px-4 py-3 animate-fade-in"
        >
          <span className="text-muted-foreground text-sm font-mono w-6 text-center">{i + 1}</span>
          {file.preview && (
            <img src={file.preview} alt={file.name} className="w-10 h-10 object-cover rounded-lg border border-border" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
            <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
          </div>
          <Button
            onClick={() => onRemove(file.id)}
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-red-500 hover:bg-red-50"
            aria-label="Remove file"
          >
            <XIcon className="size-4" />
          </Button>
        </Card>
      ))}
    </div>
  );
}
