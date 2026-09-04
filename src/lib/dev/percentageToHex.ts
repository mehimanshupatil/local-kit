export type ByteField = 'percent' | 'hex' | 'decimal';

export interface ByteTrio {
  percent: string;
  hex: string;
  decimal: string;
}

function clampByte(n: number): number {
  return Math.min(255, Math.max(0, Math.round(n)));
}

function trioFromByte(byte: number): ByteTrio {
  const b = clampByte(byte);
  return {
    percent: String(Math.round((b / 255) * 100)),
    hex: b.toString(16).padStart(2, '0').toUpperCase(),
    decimal: String(b),
  };
}

export function trioFromPercent(value: string): ByteTrio | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  const clampedPercent = Math.min(100, Math.max(0, n));
  return trioFromByte((clampedPercent / 100) * 255);
}

export function trioFromHex(value: string): ByteTrio | null {
  const cleaned = value.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{1,2}$/.test(cleaned)) return null;
  return trioFromByte(parseInt(cleaned, 16));
}

export function trioFromDecimal(value: string): ByteTrio | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return trioFromByte(n);
}

export const TRIO_PARSERS: Record<ByteField, (value: string) => ByteTrio | null> = {
  percent: trioFromPercent,
  hex: trioFromHex,
  decimal: trioFromDecimal,
};
