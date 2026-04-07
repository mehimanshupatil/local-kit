import { fetchFile } from '@ffmpeg/util';
import { getFFmpeg } from '../video/ffmpegLoader';
import { stripExtension } from '@/lib/utils/fileUtils';

export type AudioBitrate = '320k' | '256k' | '192k' | '128k' | '96k' | '64k';

function getOutputFormat(ext: string): { outputExt: string; codec: string[] } {
  switch (ext.toLowerCase()) {
    case 'ogg':
      return { outputExt: 'ogg', codec: ['-acodec', 'libvorbis'] };
    case 'aac':
    case 'm4a':
      return { outputExt: ext.toLowerCase(), codec: ['-acodec', 'aac'] };
    default:
      return { outputExt: 'mp3', codec: ['-acodec', 'libmp3lame'] };
  }
}

export async function compressAudio(
  file: File,
  bitrate: AudioBitrate,
  onProgress?: (pct: number) => void
): Promise<{ name: string; blob: Blob }> {
  const ff = await getFFmpeg();
  ff.on('progress', ({ progress }) => onProgress?.(Math.round(progress * 100)));

  const ext = file.name.split('.').pop() ?? 'mp3';
  const input = `input.${ext}`;
  const { outputExt, codec } = getOutputFormat(ext);
  const output = `output_compressed.${outputExt}`;

  await ff.writeFile(input, await fetchFile(file));

  await ff.exec([
    '-i', input,
    ...codec,
    '-b:a', bitrate,
    output,
  ]);

  const data = await ff.readFile(output);
  await ff.deleteFile(input);
  await ff.deleteFile(output);

  const mimeMap: Record<string, string> = {
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    aac: 'audio/aac',
    m4a: 'audio/mp4',
  };
  const blob = new Blob([data], { type: mimeMap[outputExt] ?? 'audio/mpeg' });
  return { name: `${stripExtension(file.name)}_compressed.${outputExt}`, blob };
}
