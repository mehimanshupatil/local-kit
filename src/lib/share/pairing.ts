// 256 short, common, easy-to-say words: one byte each
const WORDS = [
  'acorn', 'actor', 'agent', 'alarm', 'album', 'alley', 'amber', 'angel', 'ankle', 'apple', 'apron', 'arrow', 'atlas', 'attic', 'award', 'bacon',
  'badge', 'bagel', 'baker', 'banjo', 'barn', 'basil', 'beach', 'beard', 'berry', 'bison', 'blade', 'blank', 'blaze', 'bloom', 'board', 'boat',
  'bone', 'book', 'boot', 'brain', 'bread', 'brick', 'bride', 'brook', 'brush', 'bucket', 'buddy', 'bugle', 'cabin', 'cable', 'cake', 'camel',
  'candy', 'canoe', 'cape', 'card', 'cargo', 'carpet', 'castle', 'cedar', 'chair', 'chalk', 'charm', 'chef', 'cherry', 'chess', 'chick', 'chili',
  'cider', 'cinema', 'circle', 'clam', 'cliff', 'clock', 'cloud', 'clover', 'coast', 'cobra', 'cocoa', 'comet', 'coral', 'cork', 'cotton', 'couch',
  'crab', 'crane', 'crayon', 'creek', 'crown', 'cube', 'cupid', 'daisy', 'dance', 'delta', 'denim', 'desert', 'diary', 'dingo', 'disco', 'dolphin',
  'donkey', 'dragon', 'drum', 'duck', 'eagle', 'earth', 'easel', 'echo', 'elbow', 'elder', 'ember', 'emerald', 'engine', 'fable', 'fairy', 'falcon',
  'feast', 'fern', 'ferry', 'fiddle', 'field', 'finch', 'flame', 'flute', 'forest', 'fossil', 'fox', 'frog', 'frost', 'fudge', 'garden', 'garlic',
  'gecko', 'ghost', 'giant', 'ginger', 'glacier', 'globe', 'glove', 'goose', 'grape', 'gravy', 'guitar', 'hammer', 'harbor', 'harp', 'hazel', 'hedge',
  'helmet', 'heron', 'honey', 'horse', 'igloo', 'island', 'ivory', 'jacket', 'jaguar', 'jelly', 'jewel', 'jungle', 'kayak', 'kettle', 'kite', 'koala',
  'ladder', 'lagoon', 'lake', 'lemon', 'lily', 'lion', 'llama', 'lobster', 'locket', 'lotus', 'magnet', 'mango', 'maple', 'marble', 'meadow', 'melon',
  'mint', 'mirror', 'mitten', 'monkey', 'moose', 'moss', 'muffin', 'nectar', 'needle', 'nest', 'noodle', 'ocean', 'olive', 'onion', 'orbit', 'orchid',
  'otter', 'owl', 'oyster', 'paddle', 'panda', 'parrot', 'peach', 'pebble', 'pepper', 'piano', 'pickle', 'pilot', 'pine', 'pizza', 'planet', 'plum',
  'pony', 'poppy', 'puffin', 'pumpkin', 'quartz', 'quill', 'rabbit', 'radio', 'raven', 'reef', 'river', 'robin', 'rocket', 'rose', 'ruby', 'saddle',
  'salmon', 'sand', 'sauce', 'scarf', 'seal', 'shell', 'silk', 'sketch', 'sloth', 'snow', 'sock', 'spice', 'spoon', 'squid', 'star', 'storm',
  'sugar', 'summit', 'swan', 'table', 'tango', 'tiger', 'toast', 'tulip', 'turtle', 'velvet', 'violin', 'walnut', 'whale', 'willow', 'zebra', 'zinnia',
];

// 64 emojis that look distinct at a glance and have one obvious name: 6 bits each
const EMOJIS = [
  '🐶', '🐱', '🐭', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧',
  '🐦', '🦆', '🦉', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐢', '🐍', '🐙', '🦀', '🐠', '🐬', '🐳',
  '🌵', '🌲', '🌻', '🌹', '🍄', '🌙', '⭐', '🔥', '🌈', '❄️', '☂️', '🍎', '🍌', '🍇', '🍓', '🍒',
  '🍍', '🥕', '🌽', '🍕', '🍔', '🍩', '🎂', '⚽', '🏀', '🎸', '🎈', '🚲', '🚗', '✈️', '🚀', '⚓',
];

/** How long a code or link stays usable. */
export const PAIRING_TTL_MS = 10 * 60_000;

const CODE_MIN = 10;
const CODE_RANGE = 90; // two-digit numbers 10–99

const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));

/** A code to read out or type, e.g. "tiger-maple-42" (~5.9 million possibilities). */
export function generateCode(bytes: Uint8Array = randomBytes(3)): string {
  return `${WORDS[bytes[0]]}-${WORDS[bytes[1]]}-${CODE_MIN + (bytes[2] % CODE_RANGE)}`;
}

/** Tidy what someone typed into canonical form, or null if it can't be a valid code. */
export function normalizeCode(input: string): string | null {
  const parts = input.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (parts.length !== 3) return null;
  const [a, b, n] = parts;
  if (!WORDS.includes(a) || !WORDS.includes(b) || !/^\d{2}$/.test(n) || Number(n) < CODE_MIN) return null;
  return `${a}-${b}-${n}`;
}

const toBase64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** A 128-bit secret for the QR code and link. */
export function generateSecret(bytes: Uint8Array = randomBytes(16)): string {
  return toBase64Url(bytes);
}

const LINK_PARAM = 'pair';

/** Link that opens Send and pairs straight away. The secret rides in the fragment, which browsers never send to a server. */
export function pairingLink(pageUrl: string, secret: string): string {
  const url = new URL(pageUrl);
  url.search = '';
  url.hash = `${LINK_PARAM}=${secret}`;
  return url.toString();
}

/** The secret from a pairing link's fragment, if it has a well-formed one. */
export function secretFromHash(hash: string): string | null {
  const value = new URLSearchParams(hash.replace(/^#/, '')).get(LINK_PARAM);
  return value && /^[A-Za-z0-9_-]{22}$/.test(value) ? value : null;
}

export type PairingKey = { kind: 'code'; code: string } | { kind: 'link'; secret: string };

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (text: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));

/**
 * The private room a code or link leads to. The room ID is a hash so the relay
 * never sees the code; the password encrypts connection setup between the two.
 */
export async function pairingRoom(key: PairingKey): Promise<{ roomId: string; password: string }> {
  const value = key.kind === 'code' ? key.code : key.secret;
  const [room, password] = await Promise.all([
    sha256(`localkit-pair-room:${key.kind}:${value}`),
    sha256(`localkit-pair-password:${key.kind}:${value}`),
  ]);
  return { roomId: hex(room).slice(0, 32), password: hex(password) };
}

/** The DTLS certificate fingerprint from an SDP, e.g. "sha-256 AB:CD:…". */
export function fingerprintFromSdp(sdp: string | undefined | null): string | null {
  const match = sdp?.match(/^a=fingerprint:(\S+) ([0-9A-Fa-f:]+)\s*$/m);
  return match ? `${match[1].toLowerCase()} ${match[2].toUpperCase()}` : null;
}

/**
 * Four emojis both devices derive from the two ends' DTLS fingerprints. Someone
 * relaying the connection would have their own certificate on each side, so the
 * two screens would show different emojis.
 */
export async function safetyEmojis(fingerprintA: string, fingerprintB: string): Promise<string[]> {
  // Sorted so both ends hash the same string whichever side they're on
  const bytes = new Uint8Array(await sha256([fingerprintA, fingerprintB].sort().join('|')));
  const bits = (bytes[0] << 16) | (bytes[1] << 8) | bytes[2];
  return [18, 12, 6, 0].map(shift => EMOJIS[(bits >> shift) & 63]);
}

export const PAIRING_WORDS = WORDS;
export const SAFETY_EMOJIS = EMOJIS;
