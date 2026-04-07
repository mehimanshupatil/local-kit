import { fetchFile } from '@ffmpeg/util';
import { getFFmpeg } from '../video/ffmpegLoader';
import { stripExtension } from '@/lib/utils/fileUtils';

export type AudioFormat = 'mp3' | 'aac' | 'wav' | 'ogg' | 'flac';

const AUDIO_ARGS: Record<AudioFormat, string[]> = {
  mp3:  ['-acodec', 'libmp3lame', '-q:a', '2'],
  aac:  ['-acodec', 'aac', '-b:a', '192k'],
  wav:  ['-acodec', 'pcm_s16le'],
  ogg:  ['-acodec', 'libvorbis', '-q:a', '4'],
  flac: ['-acodec', 'flac'],
};

const MIME: Record<AudioFormat, string> = {
  mp3:  'audio/mpeg',
  aac:  'audio/aac',
  wav:  'audio/wav',
  ogg:  'audio/ogg',
  flac: 'audio/flac',
};

export async function convertAudio(
  file: File,
  targetFormat: AudioFormat,
  onProgress?: (pct: number) => void
): Promise<{ name: string; blob: Blob }> {
  const ff = await getFFmpeg();
  ff.on('progress', ({ progress }) => onProgress?.(Math.round(progress * 100)));

  const ext = file.name.split('.').pop() ?? 'mp3';
  const input = `input.${ext}`;
  const output = `output.${targetFormat}`;

  await ff.writeFile(input, await fetchFile(file));

  await ff.exec(['-i', input, ...AUDIO_ARGS[targetFormat], output]);

  const data = await ff.readFile(output);
  await ff.deleteFile(input);
  await ff.deleteFile(output);

  const blob = new Blob([data], { type: MIME[targetFormat] });
  return { name: `${stripExtension(file.name)}.${targetFormat}`, blob };
}
