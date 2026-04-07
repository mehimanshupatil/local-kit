export async function removeImageBackground(
  file: File,
  onProgress?: (stage: string, pct: number) => void
): Promise<Blob> {
  const { removeBackground } = await import('@imgly/background-removal');

  const result = await removeBackground(file, {
    progress: (key: string, current: number, total: number) => {
      const pct = total > 0 ? Math.round((current / total) * 100) : 0;
      onProgress?.(key, pct);
    },
  });

  return result;
}
