import { fetchFile } from '@ffmpeg/util';
import { getFFmpeg } from './ffmpegLoader';
import { stripExtension } from '@/lib/utils/fileUtils';

export async function removeAudio(
  file: File,
  onProgress?: (pct: number) => void
): Promise<{ name: string; blob: Blob }> {
  const ff = await getFFmpeg();
  ff.on('progress', ({ progress }) => onProgress?.(Math.round(progress * 100)));

  const ext = file.name.split('.').pop() ?? 'mp4';
  const input = `input.${ext}`;
  const output = `output.${ext}`;

  await ff.writeFile(input, await fetchFile(file));

  await ff.exec(['-i', input, '-an', '-c:v', 'copy', output]);

  const data = await ff.readFile(output);
  await ff.deleteFile(input);
  await ff.deleteFile(output);

  const mimeMap: Record<string, string> = {
    mp4: 'video/mp4',
    webm: 'video/webm',
    avi: 'video/x-msvideo',
    mov: 'video/quicktime',
    mkv: 'video/x-matroska',
  };
  const mime = mimeMap[ext.toLowerCase()] ?? 'video/mp4';

  const blob = new Blob([data as Uint8Array<ArrayBuffer>], { type: mime });
  return { name: `${stripExtension(file.name)}_muted.${ext}`, blob };
}
