import { fetchFile } from '@ffmpeg/util';
import { getFFmpeg } from './ffmpegLoader';
import { stripExtension } from '@/lib/utils/fileUtils';

export type VideoFormat = 'mp4' | 'webm' | 'avi' | 'mov' | 'gif';

const FORMAT_ARGS: Record<VideoFormat, string[]> = {
  mp4: ['-vcodec', 'libx264', '-acodec', 'aac', '-movflags', '+faststart'],
  webm: ['-vcodec', 'libvpx-vp9', '-b:v', '0', '-crf', '30', '-acodec', 'libopus'],
  avi: ['-vcodec', 'libx264', '-acodec', 'mp3'],
  mov: ['-vcodec', 'libx264', '-acodec', 'aac'],
  gif: ['-vf', 'fps=15,scale=480:-1:flags=lanczos', '-loop', '0'],
};

export async function convertVideo(
  file: File,
  targetFormat: VideoFormat,
  onProgress?: (pct: number) => void
): Promise<{ name: string; blob: Blob }> {
  const ff = await getFFmpeg();
  ff.on('progress', ({ progress }) => onProgress?.(Math.round(progress * 100)));

  const ext = file.name.split('.').pop() ?? 'mp4';
  const input = `input.${ext}`;
  const output = `output.${targetFormat}`;

  await ff.writeFile(input, await fetchFile(file));

  await ff.exec(['-i', input, ...FORMAT_ARGS[targetFormat], output]);

  const data = await ff.readFile(output);
  await ff.deleteFile(input);
  await ff.deleteFile(output);

  const mimeMap: Record<VideoFormat, string> = {
    mp4: 'video/mp4', webm: 'video/webm', avi: 'video/x-msvideo',
    mov: 'video/quicktime', gif: 'image/gif',
  };

  const blob = new Blob([data], { type: mimeMap[targetFormat] });
  return { name: `${stripExtension(file.name)}.${targetFormat}`, blob };
}
