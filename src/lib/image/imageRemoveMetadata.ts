// Strips all metadata by redrawing on canvas (works for JPEG, PNG, WebP).
// Also use exifr to read what was there before stripping, returned as summary.
import exifr from 'exifr';

export interface MetadataSummary {
  fields: { key: string; value: string }[];
}

export async function readMetadata(file: File): Promise<MetadataSummary> {
  try {
    const data = await exifr.parse(file, true);
    if (!data) return { fields: [] };
    const fields = Object.entries(data)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([key, value]) => ({
        key,
        value: value instanceof Date
          ? value.toLocaleString()
          : ArrayBuffer.isView(value) || Array.isArray(value)
            ? `[${Array.isArray(value) ? value.slice(0, 4).join(', ') : '...'}]`
            : String(value).slice(0, 120),
      }));
    return { fields };
  } catch {
    return { fields: [] };
  }
}

export async function removeMetadata(
  file: File,
  onProgress?: (pct: number) => void
): Promise<Blob> {
  onProgress?.(10);
  const bitmap = await createImageBitmap(file);
  onProgress?.(40);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
  onProgress?.(70);
  const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const blob = await new Promise<Blob>((res, rej) =>
    canvas.toBlob(b => b ? res(b) : rej(new Error('Canvas export failed')), mimeType, 0.95)
  );
  onProgress?.(100);
  return blob;
}
