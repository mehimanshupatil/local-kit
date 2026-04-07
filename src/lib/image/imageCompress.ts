import imageCompression from 'browser-image-compression';
import { stripExtension, getExtension } from '@/lib/utils/fileUtils';

export interface CompressConfig {
  maxSizeMB: number;
  maxWidthOrHeight?: number;
  quality?: number; // 0-1
}

export async function compressImage(
  file: File,
  config: CompressConfig,
  onProgress?: (pct: number) => void
): Promise<{ name: string; blob: Blob; originalSize: number; newSize: number }> {
  const compressed = await imageCompression(file, {
    maxSizeMB: config.maxSizeMB,
    maxWidthOrHeight: config.maxWidthOrHeight,
    initialQuality: config.quality ?? 0.8,
    useWebWorker: true,
    onProgress,
  });

  const ext = getExtension(file.name);
  return {
    name: `${stripExtension(file.name)}_compressed.${ext}`,
    blob: compressed,
    originalSize: file.size,
    newSize: compressed.size,
  };
}
