// @ts-ignore
import JSZip from 'jszip';
import type { OutputFile } from '@/components/shared/OutputFiles';

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function downloadAllAsZip(files: OutputFile[], zipName = 'output.zip'): Promise<void> {
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.name, file.blob);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(blob, zipName);
}
