export type SvgEncoding = 'url' | 'base64';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/**
 * A data URI SVG is a standalone XML document, not an inline fragment — it
 * needs its own xmlns or browsers refuse to render it (this is invisible
 * when pasting markup straight from inline page usage, since the browser
 * DOM inherits the namespace implicitly there). Add it if missing.
 */
export function ensureSvgNamespace(svg: string): string {
  if (/<svg[^>]*\sxmlns\s*=/i.test(svg)) return svg;
  return svg.replace(/<svg/i, `<svg xmlns="${SVG_NAMESPACE}"`);
}

/**
 * Minimal SVG-aware escape for embedding in a `data:image/svg+xml,` URI.
 * Escapes only the characters that break URI/CSS parsing — notably still
 * needed even beyond `"%#<>`, since curly braces from inline <style> blocks
 * and brackets/backslashes in path data silently break Firefox's data-URI
 * parser even where Chrome tolerates them raw. Everything else is left raw,
 * producing a much shorter string than `encodeURIComponent`.
 */
export function minimalEscapeSvg(svg: string): string {
  return svg
    .replace(/"/g, "'")
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/[{}|\\^~[\]`"#%<>]/g, c => encodeURIComponent(c));
}

export function encodeSvgToDataUri(svg: string, encoding: SvgEncoding): string {
  const namespaced = ensureSvgNamespace(svg);
  if (encoding === 'base64') {
    const bytes = new TextEncoder().encode(namespaced);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return `data:image/svg+xml;base64,${btoa(binary)}`;
  }
  return `data:image/svg+xml,${minimalEscapeSvg(namespaced)}`;
}

/** Loose heuristic used only for a non-blocking input warning. */
export function looksLikeSvg(text: string): boolean {
  return /<svg[\s>]/i.test(text);
}
