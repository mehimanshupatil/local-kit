import { describe, expect, it } from 'vitest';
import { mediaErrorMessage } from './media';

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
