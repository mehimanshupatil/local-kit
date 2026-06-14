import { fetchFile } from '@ffmpeg/util';
import { getFFmpeg } from '../video/ffmpegLoader';

export type MergeAudioFormat = 'mp3' | 'aac' | 'wav';

const FORMAT_ARGS: Record<MergeAudioFormat, string[]> = {
  mp3: ['-c:a', 'libmp3lame', '-q:a', '2'],
  aac: ['-c:a', 'aac', '-b:a', '192k'],
  wav: ['-c:a', 'pcm_s16le'],
};

const MIME: Record<MergeAudioFormat, string> = {
  mp3: 'audio/mpeg',
  aac: 'audio/aac',
  wav: 'audio/wav',
};

export async function mergeAudio(
  files: File[],
  targetFormat: MergeAudioFormat,
  onProgress?: (pct: number) => void
): Promise<{ name: string; blob: Blob }> {
  const ff = await getFFmpeg();
  ff.on('progress', ({ progress }) => onProgress?.(Math.round(progress * 100)));

  let concatContent = '';
  const inputNames: string[] = [];

  for (const [i, file] of files.entries()) {
    const ext = file.name.split('.').pop() ?? 'mp3';
    const inputName = `audio${i}.${ext}`;
    await ff.writeFile(inputName, await fetchFile(file));
    concatContent += `file '${inputName}'\n`;
    inputNames.push(inputName);
  }

  await ff.writeFile('concat.txt', concatContent);

  const output = `output.${targetFormat}`;
  await ff.exec([
    '-f', 'concat',
    '-safe', '0',
    '-i', 'concat.txt',
    ...FORMAT_ARGS[targetFormat],
    output,
  ]);

  const data = await ff.readFile(output);

  for (const name of inputNames) await ff.deleteFile(name);
  await ff.deleteFile('concat.txt');
  await ff.deleteFile(output);

  const blob = new Blob([data as Uint8Array<ArrayBuffer>], { type: MIME[targetFormat] });
  return { name: `merged.${targetFormat}`, blob };
}
