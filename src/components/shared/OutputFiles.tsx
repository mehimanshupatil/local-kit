import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { downloadBlob, downloadAllAsZip } from '@/lib/utils/downloadUtils';
import { formatFileSize } from '@/lib/utils/fileUtils';
import { Download, Archive } from 'lucide-react';
import { useEffect, useState } from 'react';

export interface OutputFile {
  name: string;
  blob: Blob;
  size: number;
}

interface Props {
  files: OutputFile[];
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

export default function OutputFiles({ files }: Props) {
  if (files.length === 0) return null;

  const isImage = (file: OutputFile) => file.blob.type.startsWith('image/');

  return (
    <Card className="animate-slide-up">
      <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
        <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <span>✅</span> Output ({files.length} {files.length === 1 ? 'file' : 'files'})
        </h3>
        {files.length > 1 && (
          <Button size="sm" onClick={() => downloadAllAsZip(files)}>
            <Archive className="w-3.5 h-3.5" />
            Download All (.zip)
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {files.map((file, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800">
            {isImage(file) && <ImagePreview blob={file.blob} />}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{file.name}</p>
              <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
            </div>
            <Button size="sm" onClick={() => downloadBlob(file.blob, file.name)}>
              <Download className="w-3.5 h-3.5" />
              Download
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
