import { stripExtension } from '@/lib/utils/fileUtils';

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
};

export async function convertImage(
  file: File,
  targetMime: string,
  quality = 0.9
): Promise<{ name: string; blob: Blob }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;

      // White background for JPEG (no transparency)
      if (targetMime === 'image/jpeg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      ctx.drawImage(img, 0, 0);

      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error('Conversion failed'));
          const ext = MIME_TO_EXT[targetMime] ?? 'bin';
          resolve({ name: `${stripExtension(file.name)}.${ext}`, blob });
        },
        targetMime,
        quality
      );
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = url;
  });
}
