import { describe, expect, it } from 'vitest';
import { linkify } from './text';

const links = (text: string) => linkify(text).filter(p => p.type === 'link').map(p => (p.type === 'link' ? p.href : ''));

describe('linkify', () => {
  it('returns plain text untouched', () => {
    expect(linkify('just some words')).toEqual([{ type: 'text', value: 'just some words' }]);
    expect(linkify('')).toEqual([]);
  });

  it('splits text around http and https links', () => {
    expect(linkify('see https://example.com/a?b=1 and http://x.org')).toEqual([
      { type: 'text', value: 'see ' },
      { type: 'link', value: 'https://example.com/a?b=1', href: 'https://example.com/a?b=1' },
      { type: 'text', value: ' and ' },
      { type: 'link', value: 'http://x.org', href: 'http://x.org' },
    ]);
  });

  it('adds https:// to bare www. links', () => {
    expect(links('go to www.example.com now')).toEqual(['https://www.example.com']);
  });

  it('leaves sentence punctuation outside the link', () => {
    expect(links('Read https://example.com/page.')).toEqual(['https://example.com/page']);
    expect(links('(see https://example.com/x), then')).toEqual(['https://example.com/x']);
    expect(links('"https://example.com/q?a=1"!')).toEqual(['https://example.com/q?a=1']);
  });

  it('keeps balanced brackets that belong to the URL', () => {
    expect(links('https://en.wikipedia.org/wiki/Mercury_(planet) is hot')).toEqual(['https://en.wikipedia.org/wiki/Mercury_(planet)']);
    expect(links('(https://en.wikipedia.org/wiki/Mercury_(planet))')).toEqual(['https://en.wikipedia.org/wiki/Mercury_(planet)']);
  });

  it('never links unsafe schemes', () => {
    expect(links('javascript:alert(1) data:text/html,<b>x</b> file:///etc/passwd')).toEqual([]);
    // A javascript: URL hidden after an http one is part of the plain text, not a second link
    expect(links('http://ok.com javascript:alert(1)')).toEqual(['http://ok.com']);
  });

  it('does not treat markup as part of a link', () => {
    expect(links('<a href="https://evil.example">x</a>')).toEqual(['https://evil.example']);
  });

  it('ignores a scheme with no host', () => {
    expect(links('https:// is a prefix')).toEqual([]);
  });

  it('links localhost and IP addresses', () => {
    expect(links('http://localhost:4321/x and http://192.168.1.5:8080')).toEqual(['http://localhost:4321/x', 'http://192.168.1.5:8080']);
  });

  it('round-trips the original text', () => {
    const text = 'a https://b.com/c. d www.e.org (f https://g.com/h_(i)) j';
    expect(linkify(text).map(p => p.value).join('')).toBe(text);
  });
});
