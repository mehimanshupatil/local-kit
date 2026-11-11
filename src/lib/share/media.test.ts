import { describe, expect, it } from 'vitest';
import { canShareScreen, mediaErrorMessage, nextCamera } from './media';

const err = (name: string) => new DOMException('x', name);

describe('mediaErrorMessage', () => {
  it('explains a blocked permission and how to fix it', () => {
    expect(mediaErrorMessage(err('NotAllowedError'))).toMatch(/isn't allowed.*site settings/);
    expect(mediaErrorMessage(err('SecurityError'))).toMatch(/isn't allowed/);
  });

  it('explains a missing device', () => {
    expect(mediaErrorMessage(err('NotFoundError'))).toMatch(/No camera or microphone/);
    expect(mediaErrorMessage(err('OverconstrainedError'))).toMatch(/No camera or microphone/);
  });

  it('explains a device another app is using', () => {
    expect(mediaErrorMessage(err('NotReadableError'))).toMatch(/another app/);
  });

  it('falls back for anything else', () => {
    expect(mediaErrorMessage(new Error('boom'))).toBe("Couldn't start your camera and microphone.");
    expect(mediaErrorMessage('nope')).toBe("Couldn't start your camera and microphone.");
  });
});

describe('nextCamera', () => {
  const cams = [{ deviceId: 'front' }, { deviceId: 'back' }, { deviceId: 'usb' }];

  it('moves to the next camera and wraps round', () => {
    expect(nextCamera(cams, 'front')).toBe('back');
    expect(nextCamera(cams, 'usb')).toBe('front');
  });

  it('starts from the first when the current one is unknown', () => {
    expect(nextCamera(cams, undefined)).toBe('front');
    expect(nextCamera(cams, 'gone')).toBe('front');
  });

  it('has nothing to switch to with one camera or none', () => {
    expect(nextCamera([{ deviceId: 'only' }], 'only')).toBeNull();
    expect(nextCamera([], undefined)).toBeNull();
  });
});

describe('canShareScreen', () => {
  it('is off on mobile whatever the browser offers', () => {
    expect(canShareScreen(true)).toBe(false);
  });
});
