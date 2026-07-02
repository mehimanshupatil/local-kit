import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EyeIcon, EyeSlashIcon } from '@phosphor-icons/react';
import { FilePdfIcon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useDisclosure } from '@mantine/hooks';
import { formatFileSize } from '@/lib/utils/fileUtils';

interface Props {
  file: { name: string; size: number; buffer: ArrayBuffer };
  total?: number;
  onClear: () => void;
}

export default function PDFFileBar({ file, total, onClear }: Props) {
  const [opened, { toggle }] = useDisclosure(false);
  const [url, setUrl] = useState('');

  useEffect(() => {
    const blob = new Blob([file.buffer], { type: 'application/pdf' });
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file.buffer]);

  return (
    <Card className="rounded-xl border overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <FilePdfIcon size={28} />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-foreground truncate">{file.name}</p>
          <p className="text-xs text-muted-foreground">
            {total != null ? `${total} pages · ` : ''}{formatFileSize(file.size)}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={toggle} title={opened ? 'Hide preview' : 'Preview PDF'}>
          {opened ? <EyeSlashIcon className="size-4" /> : <EyeIcon className="size-4" />}
        </Button>
        <Button variant="secondary" size="sm" onClick={onClear}>Change</Button>
      </div>
      {opened && url && (
        <iframe
          src={url}
          className="w-full border-t border-border"
          style={{ height: 600 }}
          title="PDF preview"
        />
      )}
    </Card>
  );
}
