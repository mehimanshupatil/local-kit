import { fetchFile } from '@ffmpeg/util';
import { getFFmpeg } from './ffmpegLoader';
import { stripExtension } from '@/lib/utils/fileUtils';

export type VideoQuality = 'high' | 'medium' | 'low';

const CRF: Record<VideoQuality, number> = { high: 23, medium: 28, low: 35 };

export async function compressVideo(
  file: File,
  quality: VideoQuality,
  onProgress?: (pct: number) => void
): Promise<{ name: string; blob: Blob }> {
  const ff = await getFFmpeg();
  ff.on('progress', ({ progress }) => onProgress?.(Math.round(progress * 100)));

  await ff.writeFile('input.mp4', await fetchFile(file));

  await ff.exec([
    '-i', 'input.mp4',
    '-vcodec', 'libx264',
    '-crf', String(CRF[quality]),
    '-preset', 'fast',
    '-movflags', '+faststart',
    'output.mp4',
  ]);

  const data = await ff.readFile('output.mp4');
  await ff.deleteFile('input.mp4');
  await ff.deleteFile('output.mp4');

  const blob = new Blob([data], { type: 'video/mp4' });
  return { name: `${stripExtension(file.name)}_compressed.mp4`, blob };
}
