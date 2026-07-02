import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);

export type Precision = 's' | 'ms' | 'µs' | 'ns';

export interface ParsedEpoch {
  ms: number;
  precision: Precision;
}

export interface EpochFormats {
  utcIso: string;
  utcLocale: string;
  relative: string;
  localIso: string;
  localLocale: string;
  customIso: string;
  customLocale: string;
}

/** Detect precision by digit count (handles negative epochs too) */
export function detectPrecision(raw: string): Precision {
  const digits = raw.replace(/^-/, '').replace('.', '').length;
  if (digits <= 10) return 's';
  if (digits <= 13) return 'ms';
  if (digits <= 16) return 'µs';
  return 'ns';
}

/** Convert raw epoch string + precision to milliseconds */
export function toMs(raw: string, precision: Precision): number {
  const n = parseFloat(raw);
  if (precision === 's') return n * 1000;
  if (precision === 'ms') return n;
  if (precision === 'µs') return n / 1000;
  return n / 1_000_000;
}

/** Convert ms back to epoch in given precision */
export function fromMs(ms: number, precision: Precision): number {
  if (precision === 's') return Math.floor(ms / 1000);
  if (precision === 'ms') return ms;
  if (precision === 'µs') return ms * 1000;
  return ms * 1_000_000;
}

export function formatEpoch(ms: number, customTz: string): EpochFormats {
  const d = dayjs(ms);
  const dCustom = dayjs(ms).tz(customTz);
  const localeOpts: Intl.DateTimeFormatOptions = {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    weekday: 'short',
  };

  return {
    utcIso: d.utc().format('YYYY-MM-DDTHH:mm:ss[Z]'),
    utcLocale: new Date(ms).toLocaleString('en-US', { ...localeOpts, timeZone: 'UTC' }),
    relative: d.fromNow(),
    localIso: d.format('YYYY-MM-DDTHH:mm:ssZ'),
    localLocale: new Date(ms).toLocaleString('en-US', localeOpts),
    customIso: dCustom.format('YYYY-MM-DDTHH:mm:ssZ'),
    customLocale: new Date(ms).toLocaleString('en-US', { ...localeOpts, timeZone: customTz }),
  };
}

/** Parse a date string + timezone to ms epoch */
export function dateToEpoch(isoString: string, tz: string): number | null {
  const d = tz === 'UTC'
    ? dayjs.utc(isoString)
    : dayjs.tz(isoString, tz);
  if (!d.isValid()) return null;
  return d.valueOf();
}

/** All IANA timezone names available in the runtime */
export function getIanaTimezones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return ['UTC', 'America/New_York', 'America/Los_Angeles', 'Europe/London',
      'Europe/Paris', 'Asia/Tokyo', 'Asia/Kolkata', 'Australia/Sydney'];
  }
}

export const PRECISIONS: { label: string; value: Precision }[] = [
  { label: 'Auto-detect', value: 'ms' }, // placeholder, auto handled separately
  { label: 'Seconds (s)', value: 's' },
  { label: 'Milliseconds (ms)', value: 'ms' },
  { label: 'Microseconds (µs)', value: 'µs' },
  { label: 'Nanoseconds (ns)', value: 'ns' },
];
