import { fetchFile } from '@ffmpeg/util';
import { getFFmpeg } from './ffmpegLoader';
import { stripExtension } from '@/lib/utils/fileUtils';

export async function trimVideo(
  file: File,
  startSec: number,
  endSec: number,
  onProgress?: (pct: number) => void
): Promise<{ name: string; blob: Blob }> {
  const ff = await getFFmpeg();
  ff.on('progress', ({ progress }) => onProgress?.(Math.round(progress * 100)));

  const ext = file.name.split('.').pop() ?? 'mp4';
  const input = `input.${ext}`;
  const output = `output_trimmed.${ext}`;

  await ff.writeFile(input, await fetchFile(file));

  const duration = endSec - startSec;
  await ff.exec([
    '-i', input,
    '-ss', String(startSec),
    '-t', String(duration),
    '-c', 'copy',
    output,
  ]);

  const data = await ff.readFile(output);
  await ff.deleteFile(input);
  await ff.deleteFile(output);

  const blob = new Blob([data], { type: file.type });
  return { name: `${stripExtension(file.name)}_trimmed.${ext}`, blob };
}
