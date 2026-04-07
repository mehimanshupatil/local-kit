import { stripExtension, getExtension } from '@/lib/utils/fileUtils';

export type ResizeMode = 'exact' | 'fit' | 'fill';

export interface ResizeConfig {
  width: number;
  height: number;
  mode: ResizeMode;
  quality?: number;
}

export async function resizeImage(
  file: File,
  config: ResizeConfig
): Promise<{ name: string; blob: Blob }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const { width: tw, height: th, mode } = config;

      let dw = tw, dh = th;
      let sx = 0, sy = 0, sw = img.width, sh = img.height;

      if (mode === 'fit') {
        const scale = Math.min(tw / img.width, th / img.height);
        dw = Math.round(img.width * scale);
        dh = Math.round(img.height * scale);
      } else if (mode === 'fill') {
        const scale = Math.max(tw / img.width, th / img.height);
        sw = Math.round(tw / scale);
        sh = Math.round(th / scale);
        sx = Math.round((img.width - sw) / 2);
        sy = Math.round((img.height - sh) / 2);
      }

      const canvas = document.createElement('canvas');
      canvas.width = dw;
      canvas.height = dh;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);

      const mime = file.type || 'image/jpeg';
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error('Resize failed'));
          const ext = getExtension(file.name) || 'jpg';
          resolve({ name: `${stripExtension(file.name)}_${dw}x${dh}.${ext}`, blob });
        },
        mime,
        config.quality ?? 0.9
      );
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = url;
  });
}
