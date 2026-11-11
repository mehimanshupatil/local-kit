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
