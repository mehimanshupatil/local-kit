import { describe, expect, it } from 'vitest';
import { trioFromDecimal, trioFromHex, trioFromPercent } from './percentageToHex';

describe('trioFromPercent', () => {
  it('matches the worked example: 35% -> hex 59 / decimal 89', () => {
    expect(trioFromPercent('35')).toEqual({ percent: '35', hex: '59', decimal: '89' });
  });

  it('rounds half up, matching the existing colorConverter.ts convention', () => {
    // 50% * 255 = 127.5 -> rounds up to 128 / 0x80
    expect(trioFromPercent('50')).toEqual({ percent: '50', hex: '80', decimal: '128' });
  });

  it('handles the exact boundaries', () => {
    expect(trioFromPercent('0')).toEqual({ percent: '0', hex: '00', decimal: '0' });
    expect(trioFromPercent('100')).toEqual({ percent: '100', hex: 'FF', decimal: '255' });
  });

  it('clamps out-of-range values instead of rejecting them', () => {
    expect(trioFromPercent('150')).toEqual({ percent: '100', hex: 'FF', decimal: '255' });
    expect(trioFromPercent('-20')).toEqual({ percent: '0', hex: '00', decimal: '0' });
  });

  it('returns null for non-numeric or empty input', () => {
    expect(trioFromPercent('abc')).toBeNull();
    expect(trioFromPercent('')).toBeNull();
    expect(trioFromPercent('   ')).toBeNull();
  });
});

describe('trioFromHex', () => {
  it('matches the worked example in reverse: hex 59 -> 35%', () => {
    expect(trioFromHex('59')).toEqual({ percent: '35', hex: '59', decimal: '89' });
  });

  it('accepts a single hex digit and an optional leading #', () => {
    expect(trioFromHex('5')).toEqual({ percent: '2', hex: '05', decimal: '5' });
    expect(trioFromHex('#FF')).toEqual({ percent: '100', hex: 'FF', decimal: '255' });
  });

  it('normalizes case to uppercase', () => {
    expect(trioFromHex('ab')?.hex).toBe('AB');
  });

  it('returns null for invalid hex characters or length', () => {
    expect(trioFromHex('GG')).toBeNull();
    expect(trioFromHex('ABC')).toBeNull();
    expect(trioFromHex('')).toBeNull();
  });
});

describe('trioFromDecimal', () => {
  it('matches the worked example in reverse: decimal 89 -> 35%', () => {
    expect(trioFromDecimal('89')).toEqual({ percent: '35', hex: '59', decimal: '89' });
  });

  it('clamps out-of-range values instead of rejecting them', () => {
    expect(trioFromDecimal('300')).toEqual({ percent: '100', hex: 'FF', decimal: '255' });
    expect(trioFromDecimal('-5')).toEqual({ percent: '0', hex: '00', decimal: '0' });
  });

  it('returns null for non-numeric or empty input', () => {
    expect(trioFromDecimal('abc')).toBeNull();
    expect(trioFromDecimal('')).toBeNull();
  });
});
