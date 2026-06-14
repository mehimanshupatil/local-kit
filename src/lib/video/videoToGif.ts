import { fetchFile } from '@ffmpeg/util';
import { getFFmpeg } from './ffmpegLoader';
import { stripExtension } from '@/lib/utils/fileUtils';

export async function videoToGif(
  file: File,
  fps: number,
  width: number,
  onProgress?: (pct: number) => void
): Promise<{ name: string; blob: Blob }> {
  const ff = await getFFmpeg();
  ff.on('progress', ({ progress }) => onProgress?.(Math.round(progress * 100)));

  const ext = file.name.split('.').pop() ?? 'mp4';
  const input = `input.${ext}`;
  const output = 'output.gif';

  await ff.writeFile(input, await fetchFile(file));

  await ff.exec([
    '-i', input,
    '-vf', `fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
    '-loop', '0',
    output,
  ]);

  const data = await ff.readFile(output);
  await ff.deleteFile(input);
  await ff.deleteFile(output);

  const blob = new Blob([data as Uint8Array<ArrayBuffer>], { type: 'image/gif' });
  return { name: `${stripExtension(file.name)}.gif`, blob };
}
