import { Button } from '@/components/ui/button';
import { Eye, EyeOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatFileSize } from '@/lib/utils/fileUtils';

interface Props {
  file: { name: string; size: number; buffer: ArrayBuffer };
  total?: number;
  onClear: () => void;
}

export default function PDFFileBar({ file, total, onClear }: Props) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');

  useEffect(() => {
    const blob = new Blob([file.buffer], { type: 'application/pdf' });
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file.buffer]);

  return (
    <div className="card rounded-xl border overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="text-2xl">📄</span>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{file.name}</p>
          <p className="text-xs text-gray-500">
            {total != null ? `${total} pages · ` : ''}{formatFileSize(file.size)}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setOpen(v => !v)} title={open ? 'Hide preview' : 'Preview PDF'}>
          {open ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </Button>
        <Button variant="secondary" size="sm" onClick={onClear}>Change</Button>
      </div>
      {open && url && (
        <iframe
          src={url}
          className="w-full border-t border-gray-200 dark:border-gray-700"
          style={{ height: 600 }}
          title="PDF preview"
        />
      )}
    </div>
  );
}
