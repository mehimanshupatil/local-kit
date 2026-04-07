export interface Transform {
  crop: { x: number; y: number; width: number; height: number } | null;
  rotation: number; // 0, 90, 180, 270
  flipH: boolean;
  flipV: boolean;
}

export async function applyTransform(
  file: File,
  transform: Transform
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { rotation, flipH, flipV, crop } = transform;

      // Source region
      const sx = crop?.x ?? 0;
      const sy = crop?.y ?? 0;
      const sw = crop?.width ?? img.naturalWidth;
      const sh = crop?.height ?? img.naturalHeight;

      // After rotation, canvas w/h swap for 90/270
      const rotated = rotation === 90 || rotation === 270;
      const cw = rotated ? sh : sw;
      const ch = rotated ? sw : sh;

      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d')!;

      ctx.translate(cw / 2, ch / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      if (flipH) ctx.scale(-1, 1);
      if (flipV) ctx.scale(1, -1);
      ctx.drawImage(img, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh);

      canvas.toBlob(
        b => b ? resolve(b) : reject(new Error('toBlob failed')),
        file.type || 'image/png'
      );
    };
    img.onerror = reject;
    img.src = url;
  });
}
