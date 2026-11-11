import { randomDeviceName } from './names';

export type DeviceKind = 'phone' | 'tablet' | 'computer';

// Types, not interfaces: these go over the wire and must satisfy Trystero's JSON type
export type DeviceInfo = {
  kind: DeviceKind;
  /** e.g. "Chrome on Mac"; empty when nothing is recognisable. */
  label: string;
};

/** What other devices learn about this one when they connect. */
export type Profile = {
  name: string;
  device: DeviceInfo;
};

export const MAX_NAME_LENGTH = 40;
const MAX_LABEL_LENGTH = 60;

const BROWSERS: [RegExp, string][] = [
  // Order matters: Edge, Opera and Samsung Internet all also claim to be Chrome
  [/EdgiOS|EdgA?\//, 'Edge'],
  [/OPR\/|OPiOS|Opera/, 'Opera'],
  [/SamsungBrowser/, 'Samsung Internet'],
  [/FxiOS|Firefox\//, 'Firefox'],
  [/CriOS|Chrome\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

/** Describe a device from its user agent. `maxTouchPoints` tells an iPad (which reports itself as a Mac) apart. */
export function describeDevice(userAgent: string, maxTouchPoints = 0): DeviceInfo {
  const browser = BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1];

  let os: string | undefined;
  let kind: DeviceKind = 'computer';
  if (/iPhone|iPod/.test(userAgent)) { os = 'iPhone'; kind = 'phone'; }
  else if (/iPad/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)) { os = 'iPad'; kind = 'tablet'; }
  else if (/Android/.test(userAgent)) { os = 'Android'; kind = /Mobile/.test(userAgent) ? 'phone' : 'tablet'; }
  else if (/CrOS/.test(userAgent)) os = 'ChromeOS';
  else if (/Macintosh|Mac OS X/.test(userAgent)) os = 'Mac';
  else if (/Windows/.test(userAgent)) os = 'Windows';
  else if (/Linux/.test(userAgent)) os = 'Linux';

  const label = browser && os ? `${browser} on ${os}` : browser ?? os ?? '';
  return { kind, label };
}

export function thisDevice(): DeviceInfo {
  return describeDevice(navigator.userAgent, navigator.maxTouchPoints);
}

/** Tidy a name the user typed: one line, no surrounding space, a sensible length. */
export function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
}

/** A profile from another device, or a safe stand-in if it sent something malformed. */
export function readProfile(value: unknown): Profile {
  const v = (value ?? {}) as Partial<Profile>;
  const name = typeof v.name === 'string' ? cleanName(v.name) : '';
  const kind = v.device?.kind;
  const label = v.device?.label;
  return {
    name: name || randomDeviceName(),
    device: {
      kind: kind === 'phone' || kind === 'tablet' || kind === 'computer' ? kind : 'computer',
      label: typeof label === 'string' ? label.slice(0, MAX_LABEL_LENGTH) : '',
    },
  };
}
