/** Longest text accepted in one message (characters). */
export const MAX_TEXT_LENGTH = 100_000;

export type TextPart = { type: 'text'; value: string } | { type: 'link'; value: string; href: string };

// http(s) URLs and bare www. hosts; anything else (javascript:, data:, file:) stays plain text
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
// Punctuation that usually ends a sentence rather than the URL
const TRAILING = new Set('.,:;!?\'")]}');
const OPENER: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

const count = (s: string, ch: string) => s.split(ch).length - 1;

/** Drop trailing punctuation, except a closing bracket the URL itself opened (wiki links). */
function trimTrailing(url: string): string {
  let end = url.length;
  while (end > 0 && TRAILING.has(url[end - 1])) {
    const ch = url[end - 1];
    const open = OPENER[ch];
    if (open) {
      const body = url.slice(0, end);
      if (count(body, open) >= count(body, ch)) break;
    }
    end--;
  }
  return url.slice(0, end);
}

/** Split text into plain runs and safe http(s) links, for rendering as React text nodes and anchors. */
export function linkify(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = trimTrailing(match[0]);
    const start = match.index;
    if (!/[a-z0-9]\.[a-z]/i.test(url) && !/^https?:\/\/(localhost|\[|\d)/i.test(url)) continue;
    if (start > last) parts.push({ type: 'text', value: text.slice(last, start) });
    const href = /^www\./i.test(url) ? `https://${url}` : url;
    parts.push({ type: 'link', value: url, href });
    last = start + url.length;
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) });
  return parts;
}
