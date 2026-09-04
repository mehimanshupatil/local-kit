import { describe, expect, it } from 'vitest';
import { encodeSvgToDataUri, ensureSvgNamespace, looksLikeSvg, minimalEscapeSvg } from './svgEncoder';

describe('minimalEscapeSvg', () => {
  it('converts double quotes to single quotes instead of escaping them', () => {
    expect(minimalEscapeSvg('<svg width="10"></svg>')).toBe("%3Csvg width='10'%3E%3C/svg%3E");
  });

  it('escapes only the characters that break CSS/HTML url() parsing', () => {
    expect(minimalEscapeSvg('a#b%c')).toBe('a%23b%25c');
  });

  it('escapes curly braces and brackets, which break Firefox even when Chrome tolerates them raw', () => {
    expect(minimalEscapeSvg('<style>.a{fill:red}</style>')).not.toMatch(/[{}]/);
    expect(minimalEscapeSvg('M[0,1]')).not.toMatch(/[[\]]/);
  });

  it('collapses whitespace between tags away entirely', () => {
    expect(minimalEscapeSvg('<svg>\n  <rect/>\n</svg>')).toBe('%3Csvg%3E%3Crect/%3E%3C/svg%3E');
  });

  it('leaves ordinary characters raw, unlike encodeURIComponent', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
    const escaped = minimalEscapeSvg(svg);
    expect(escaped.length).toBeLessThan(encodeURIComponent(svg).length);
  });
});

describe('ensureSvgNamespace', () => {
  it('adds the xmlns attribute when missing', () => {
    expect(ensureSvgNamespace('<svg viewBox="0 0 10 10"><rect/></svg>'))
      .toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect/></svg>');
  });

  it('leaves an existing xmlns attribute untouched', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>';
    expect(ensureSvgNamespace(svg)).toBe(svg);
  });
});

describe('encodeSvgToDataUri', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';

  it('produces a plain data URI for url encoding', () => {
    const uri = encodeSvgToDataUri(svg, 'url');
    expect(uri.startsWith('data:image/svg+xml,')).toBe(true);
    expect(uri).not.toContain('"');
  });

  it('produces a base64 data URI for base64 encoding', () => {
    const uri = encodeSvgToDataUri(svg, 'base64');
    expect(uri.startsWith('data:image/svg+xml;base64,')).toBe(true);
    const decoded = atob(uri.replace('data:image/svg+xml;base64,', ''));
    expect(decoded).toBe(svg);
  });

  it('injects the namespace when the input SVG omits it, in both encodings', () => {
    const noNamespace = '<svg viewBox="0 0 10 10"><rect/></svg>';
    expect(encodeSvgToDataUri(noNamespace, 'url')).toContain('xmlns');

    const base64Uri = encodeSvgToDataUri(noNamespace, 'base64');
    const decoded = atob(base64Uri.replace('data:image/svg+xml;base64,', ''));
    expect(decoded).toContain('xmlns');
  });
});

describe('looksLikeSvg', () => {
  it('accepts markup with an <svg tag', () => {
    expect(looksLikeSvg('<svg viewBox="0 0 10 10"></svg>')).toBe(true);
  });

  it('rejects plain text with no svg tag', () => {
    expect(looksLikeSvg('hello world')).toBe(false);
  });

  it('does not false-positive on unrelated tags containing "svg" as a substring', () => {
    expect(looksLikeSvg('<svgx>not svg</svgx>')).toBe(false);
  });
});
