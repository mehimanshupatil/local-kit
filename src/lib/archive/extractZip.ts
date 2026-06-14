// @ts-ignore
import JSZip from 'jszip';

export interface ZipEntry {
  name: string;
  size: number;
  blob: () => Promise<Blob>;
}

export async function loadZip(file: File): Promise<ZipEntry[]> {
  const zip = await JSZip.loadAsync(file);
  return Object.entries(zip.files)
    .filter(([, f]) => !(f as any).dir)
    .map(([name, f]) => ({
      name,
      size: 0, // size not known until extracted
      blob: () => (f as any).async('blob'),
    }));
}
