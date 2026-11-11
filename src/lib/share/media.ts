/** A clear explanation for a failed getUserMedia call. */
export function mediaErrorMessage(error: unknown): string {
  const name = error instanceof DOMException || error instanceof Error ? error.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return "LocalKit isn't allowed to use your camera and microphone. Allow access in your browser's site settings (usually the icon next to the address), then try again.";
    case 'NotFoundError':
    case 'OverconstrainedError':
      return "No camera or microphone was found. Connect one, or check it's switched on, then try again.";
    case 'NotReadableError':
    case 'AbortError':
      return 'Your camera or microphone is being used by another app. Close it there, then try again.';
    default:
      return "Couldn't start your camera and microphone.";
  }
}

/** Camera and microphone for a call. */
export function openCamera(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return Promise.reject(new DOMException('Camera access is not available here', 'NotSupportedError'));
  }
  return navigator.mediaDevices.getUserMedia({ audio: true, video: { width: { ideal: 1280 }, height: { ideal: 720 } } });
}

export function stopStream(stream: MediaStream | null | undefined): void {
  for (const track of stream?.getTracks() ?? []) track.stop();
}

/** Screen sharing needs getDisplayMedia, which mobile browsers don't offer (or offer without a screen to share). */
export function canShareScreen(mobile: boolean): boolean {
  return !mobile && typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getDisplayMedia === 'function';
}

/** Ask which screen, window or tab to share. Rejects with NotAllowedError if the person cancels the picker. */
export async function openScreen(): Promise<MediaStreamTrack> {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  return stream.getVideoTracks()[0];
}

/** Cameras on this device. Their labels are only filled in once camera permission has been given. */
export async function listCameras(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  return (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
}

/** The camera after `currentId`, wrapping round; front and back on a phone. */
export function nextCamera(cameras: Pick<MediaDeviceInfo, 'deviceId'>[], currentId: string | undefined): string | null {
  if (cameras.length < 2) return null;
  const i = cameras.findIndex(c => c.deviceId === currentId);
  return cameras[(i + 1) % cameras.length].deviceId;
}

export async function openCameraTrack(deviceId: string): Promise<MediaStreamTrack> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } } });
  return stream.getVideoTracks()[0];
}

export function canPictureInPicture(): boolean {
  return typeof document !== 'undefined' && document.pictureInPictureEnabled === true;
}
