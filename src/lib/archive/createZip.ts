// @ts-ignore
import JSZip from 'jszip';

export async function createZip(files: File[], onProgress?: (pct: number) => void): Promise<Blob> {
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.name, file);
  }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }, (meta: { percent: number }) => {
    onProgress?.(Math.round(meta.percent));
  });
}
