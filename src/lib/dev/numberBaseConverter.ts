export type Base = 'bin' | 'oct' | 'dec' | 'hex';

export const BASES: { key: Base; label: string; radix: number }[] = [
  { key: 'bin', label: 'Binary', radix: 2 },
  { key: 'oct', label: 'Octal', radix: 8 },
  { key: 'dec', label: 'Decimal', radix: 10 },
  { key: 'hex', label: 'Hexadecimal', radix: 16 },
];

const VALID_CHARS: Record<Base, RegExp> = {
  bin: /^[01]+$/,
  oct: /^[0-7]+$/,
  dec: /^[0-9]+$/,
  hex: /^[0-9a-fA-F]+$/,
};

export function isValidForBase(value: string, base: Base): boolean {
  return VALID_CHARS[base].test(value);
}

export function convertFromBase(value: string, base: Base): Record<Base, string> | null {
  const trimmed = value.trim();
  if (!trimmed || !isValidForBase(trimmed, base)) return null;

  const radix = BASES.find(b => b.key === base)!.radix;
  let n: bigint;
  try {
    n = radixToBigInt(trimmed, radix);
  } catch {
    return null;
  }

  return {
    bin: n.toString(2),
    oct: n.toString(8),
    dec: n.toString(10),
    hex: n.toString(16),
  };
}

function radixToBigInt(value: string, radix: number): bigint {
  const digits = '0123456789abcdef';
  let result = 0n;
  const big = BigInt(radix);
  for (const ch of value.toLowerCase()) {
    const d = digits.indexOf(ch);
    if (d === -1 || d >= radix) throw new Error('invalid digit');
    result = result * big + BigInt(d);
  }
  return result;
}
