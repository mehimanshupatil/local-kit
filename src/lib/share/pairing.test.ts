import { describe, expect, it } from 'vitest';
import {
  PAIRING_WORDS, SAFETY_EMOJIS, fingerprintFromSdp, generateCode, generateSecret, normalizeCode, pairingLink,
  pairingRoom, safetyEmojis, secretFromHash,
} from './pairing';

describe('word and emoji lists', () => {
  it('has 256 unique lowercase words and 64 unique emojis', () => {
    expect(PAIRING_WORDS).toHaveLength(256);
    expect(new Set(PAIRING_WORDS).size).toBe(256);
    expect(PAIRING_WORDS.every(w => /^[a-z]+$/.test(w))).toBe(true);
    expect(SAFETY_EMOJIS).toHaveLength(64);
    expect(new Set(SAFETY_EMOJIS).size).toBe(64);
  });
});

describe('generateCode', () => {
  it('makes word-word-number codes', () => {
    expect(generateCode(Uint8Array.of(0, 255, 0))).toBe(`${PAIRING_WORDS[0]}-${PAIRING_WORDS[255]}-10`);
    expect(generateCode(Uint8Array.of(1, 2, 89))).toBe(`${PAIRING_WORDS[1]}-${PAIRING_WORDS[2]}-99`);
    expect(generateCode(Uint8Array.of(1, 2, 90))).toBe(`${PAIRING_WORDS[1]}-${PAIRING_WORDS[2]}-10`);
  });

  it('always produces a code that normalizes to itself', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateCode();
      expect(code).toMatch(/^[a-z]+-[a-z]+-[1-9]\d$/);
      expect(normalizeCode(code)).toBe(code);
    }
  });
});

describe('normalizeCode', () => {
  it('accepts any case and separator', () => {
    expect(normalizeCode('Tiger Maple 42')).toBe('tiger-maple-42');
    expect(normalizeCode('  tiger_maple.42 ')).toBe('tiger-maple-42');
    expect(normalizeCode('TIGER-MAPLE-42')).toBe('tiger-maple-42');
  });

  it('rejects unknown words, bad numbers and the wrong shape', () => {
    expect(normalizeCode('tiger-zzzz-42')).toBeNull();
    expect(normalizeCode('tiger-maple-4')).toBeNull();
    expect(normalizeCode('tiger-maple-05')).toBeNull();
    expect(normalizeCode('tiger-maple-123')).toBeNull();
    expect(normalizeCode('tiger-maple')).toBeNull();
    expect(normalizeCode('')).toBeNull();
  });
});

describe('secrets and links', () => {
  it('makes a 22-character URL-safe secret', () => {
    expect(generateSecret(new Uint8Array(16).fill(255))).toBe('_____________________w');
    expect(generateSecret()).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('puts the secret in the fragment and reads it back', () => {
    const secret = generateSecret();
    const link = pairingLink('https://localkit.example/share/send?x=1#old', secret);
    expect(link).toBe(`https://localkit.example/share/send#pair=${secret}`);
    expect(secretFromHash(new URL(link).hash)).toBe(secret);
  });

  it('ignores missing or malformed secrets', () => {
    expect(secretFromHash('')).toBeNull();
    expect(secretFromHash('#pair=short')).toBeNull();
    expect(secretFromHash('#pair=<script>alert(1)</script>xxxxxxx')).toBeNull();
    expect(secretFromHash('#other=abc')).toBeNull();
  });
});

describe('pairingRoom', () => {
  it('is the same for the same code and different for different ones', async () => {
    const a = await pairingRoom({ kind: 'code', code: 'tiger-maple-42' });
    expect(a).toEqual(await pairingRoom({ kind: 'code', code: 'tiger-maple-42' }));
    expect(a.roomId).not.toBe((await pairingRoom({ kind: 'code', code: 'tiger-maple-43' })).roomId);
  });

  it('keeps codes and links in separate namespaces', async () => {
    const asCode = await pairingRoom({ kind: 'code', code: 'abc' });
    const asLink = await pairingRoom({ kind: 'link', secret: 'abc' });
    expect(asCode.roomId).not.toBe(asLink.roomId);
  });

  it('derives a room ID and password that reveal nothing of the code', async () => {
    const { roomId, password } = await pairingRoom({ kind: 'code', code: 'tiger-maple-42' });
    expect(roomId).toMatch(/^[0-9a-f]{32}$/);
    expect(password).toMatch(/^[0-9a-f]{64}$/);
    expect(password.startsWith(roomId)).toBe(false);
  });
});

describe('fingerprintFromSdp', () => {
  const sdp = [
    'v=0',
    'o=- 1 2 IN IP4 127.0.0.1',
    'a=fingerprint:SHA-256 ab:cd:EF:01:23',
    'a=setup:actpass',
  ].join('\r\n');

  it('reads and normalizes the fingerprint line', () => {
    expect(fingerprintFromSdp(sdp)).toBe('sha-256 AB:CD:EF:01:23');
  });

  it('returns null without one', () => {
    expect(fingerprintFromSdp('v=0\r\n')).toBeNull();
    expect(fingerprintFromSdp(undefined)).toBeNull();
  });
});

describe('safetyEmojis', () => {
  const a = 'sha-256 AA:BB:CC';
  const b = 'sha-256 11:22:33';

  it('gives four emojis from the list', async () => {
    const emojis = await safetyEmojis(a, b);
    expect(emojis).toHaveLength(4);
    for (const e of emojis) expect(SAFETY_EMOJIS).toContain(e);
  });

  it('matches on both ends whichever order they pass the fingerprints in', async () => {
    expect(await safetyEmojis(a, b)).toEqual(await safetyEmojis(b, a));
  });

  it('differs when someone sits in the middle with their own certificate', async () => {
    const mitm = 'sha-256 66:66:66';
    expect(await safetyEmojis(a, mitm)).not.toEqual(await safetyEmojis(mitm, b));
  });
});
