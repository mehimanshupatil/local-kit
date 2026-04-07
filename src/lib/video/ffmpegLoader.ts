import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;
let loading = false;

export async function getFFmpeg(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpeg?.loaded) return ffmpeg;
  if (loading) {
    // Wait for loading to complete
    await new Promise<void>(resolve => {
      const check = setInterval(() => {
        if (ffmpeg?.loaded) { clearInterval(check); resolve(); }
      }, 100);
    });
    return ffmpeg!;
  }

  loading = true;
  ffmpeg = new FFmpeg();
  if (onLog) ffmpeg.on('log', ({ message }) => onLog(message));

  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  loading = false;
  return ffmpeg;
}
