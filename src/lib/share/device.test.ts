import { describe, expect, it } from 'vitest';
import { MAX_NAME_LENGTH, cleanName, describeDevice, readProfile } from './device';

const UA = {
  chromeMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  firefoxWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  edgeWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  safariIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  chromeIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1',
  chromeAndroidPhone: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  chromeAndroidTablet: 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  samsungAndroid: 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0',
  chromebook: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  operaWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 OPR/115.0.0.0',
};

describe('describeDevice', () => {
  it.each([
    ['chromeMac', 'computer', 'Chrome on Mac'],
    ['safariMac', 'computer', 'Safari on Mac'],
    ['firefoxWindows', 'computer', 'Firefox on Windows'],
    ['edgeWindows', 'computer', 'Edge on Windows'],
    ['operaWindows', 'computer', 'Opera on Windows'],
    ['safariIphone', 'phone', 'Safari on iPhone'],
    ['chromeIphone', 'phone', 'Chrome on iPhone'],
    ['chromeAndroidPhone', 'phone', 'Chrome on Android'],
    ['chromeAndroidTablet', 'tablet', 'Chrome on Android'],
    ['samsungAndroid', 'phone', 'Samsung Internet on Android'],
    ['firefoxLinux', 'computer', 'Firefox on Linux'],
    ['chromebook', 'computer', 'Chrome on ChromeOS'],
  ] as const)('%s → %s, "%s"', (key, kind, label) => {
    expect(describeDevice(UA[key])).toEqual({ kind, label });
  });

  it('spots an iPad that reports itself as a Mac by its touch points', () => {
    expect(describeDevice(UA.safariMac, 5)).toEqual({ kind: 'tablet', label: 'Safari on iPad' });
    expect(describeDevice(UA.safariMac, 0)).toEqual({ kind: 'computer', label: 'Safari on Mac' });
  });

  it('falls back gracefully for unknown agents', () => {
    expect(describeDevice('')).toEqual({ kind: 'computer', label: '' });
    expect(describeDevice('SomeBot/1.0 (Windows)')).toEqual({ kind: 'computer', label: 'Windows' });
  });
});

describe('cleanName', () => {
  it('trims, collapses whitespace and line breaks, and caps the length', () => {
    expect(cleanName('  My   Laptop \n ')).toBe('My Laptop');
    expect(cleanName('x'.repeat(100))).toHaveLength(MAX_NAME_LENGTH);
  });
});

describe('readProfile', () => {
  it('keeps a well-formed profile', () => {
    const profile = { name: 'Office PC', device: { kind: 'computer', label: 'Edge on Windows' } };
    expect(readProfile(profile)).toEqual(profile);
  });

  it('cleans the name and falls back to a random one if it is empty', () => {
    expect(readProfile({ name: '  Phone\n', device: { kind: 'phone', label: '' } }).name).toBe('Phone');
    expect(readProfile({ name: '   ', device: { kind: 'phone', label: '' } }).name).toMatch(/^\w+ \w+$/);
  });

  it('replaces anything malformed with safe defaults', () => {
    const profile = readProfile({ name: 42, device: { kind: 'toaster', label: { evil: true } } });
    expect(profile.device).toEqual({ kind: 'computer', label: '' });
    expect(profile.name).toMatch(/^\w+ \w+$/);
    expect(readProfile(null).device.kind).toBe('computer');
  });

  it('caps an overlong label', () => {
    expect(readProfile({ name: 'a', device: { kind: 'phone', label: 'x'.repeat(500) } }).device.label.length).toBeLessThanOrEqual(60);
  });
});
