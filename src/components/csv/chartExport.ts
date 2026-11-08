/**
 * Turn a rendered Recharts SVG into a standalone SVG / PNG.
 * Recharts paints with CSS variables (`var(--color-v0)`) and Tailwind classes,
 * which don't survive outside the page — so every element's computed paint and
 * font properties are inlined before serialising.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const INLINE_PROPS = [
  'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'opacity',
  'font-family', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline', 'visibility',
];

export interface ExportOptions {
  title?: string;
  /** Series swatches drawn under the chart (the on-page legend is HTML, not SVG) */
  legend?: { label: string; color: string }[];
}

export interface ExportedSvg {
  markup: string;
  width: number;
  height: number;
}

/** Nearest non-transparent background colour, walking up from `el`. */
export function resolveBackground(el: Element): string {
  for (let node: Element | null = el; node; node = node.parentElement) {
    const bg = getComputedStyle(node).backgroundColor;
    if (bg && bg !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(bg)) return bg;
  }
  return document.documentElement.classList.contains('dark') ? '#080808' : '#ffffff';
}

export function serializeChart(svg: SVGSVGElement, opts: ExportOptions = {}): ExportedSvg {
  const { width, height } = svg.getBoundingClientRect();
  const container = svg.parentElement ?? svg;
  const background = resolveBackground(container);
  const foreground = getComputedStyle(container).color;
  const fontFamily = getComputedStyle(container).fontFamily;

  const clone = svg.cloneNode(true) as SVGSVGElement;
  const sources = [svg, ...svg.querySelectorAll('*')];
  const targets = [clone, ...clone.querySelectorAll('*')];
  sources.forEach((src, i) => {
    const dst = targets[i] as SVGElement;
    const cs = getComputedStyle(src);
    if (cs.display === 'none') { dst.remove(); return; }
    // Presentation attributes like fill="var(--color-v0)" mean nothing outside the page.
    for (const attr of ['fill', 'stroke']) {
      if (dst.getAttribute(attr)?.includes('var(')) dst.removeAttribute(attr);
    }
    for (const p of INLINE_PROPS) {
      const v = cs.getPropertyValue(p);
      if (v) dst.style.setProperty(p, v);
    }
  });

  const titleH = opts.title ? 40 : 0;
  const legend = opts.legend ?? [];
  const legendH = legend.length ? 32 : 0;
  const totalW = Math.round(width);
  const totalH = Math.round(height + titleH + legendH);

  const root = document.createElementNS(SVG_NS, 'svg');
  root.setAttribute('xmlns', SVG_NS);
  root.setAttribute('width', String(totalW));
  root.setAttribute('height', String(totalH));
  root.setAttribute('viewBox', `0 0 ${totalW} ${totalH}`);
  root.style.setProperty('font-family', fontFamily);

  const bg = document.createElementNS(SVG_NS, 'rect');
  bg.setAttribute('width', '100%');
  bg.setAttribute('height', '100%');
  bg.setAttribute('fill', background);
  root.appendChild(bg);

  if (opts.title) {
    const t = text(opts.title, totalW / 2, 26, foreground);
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('font-size', '16');
    t.setAttribute('font-weight', '600');
    root.appendChild(t);
  }

  clone.setAttribute('x', '0');
  clone.setAttribute('y', String(titleH));
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.removeAttribute('style');
  root.appendChild(clone);

  if (legend.length) {
    // Rough width per item; good enough to centre a single line of swatches.
    const itemW = legend.map(l => 22 + l.label.length * 7 + 16);
    let x = Math.max(8, (totalW - itemW.reduce((a, b) => a + b, 0)) / 2);
    const y = titleH + height + 16;
    legend.forEach((l, i) => {
      const sw = document.createElementNS(SVG_NS, 'rect');
      sw.setAttribute('x', String(x));
      sw.setAttribute('y', String(y - 5));
      sw.setAttribute('width', '10');
      sw.setAttribute('height', '10');
      sw.setAttribute('rx', '2');
      sw.setAttribute('fill', l.color);
      root.appendChild(sw);
      const t = text(l.label, x + 16, y, foreground);
      t.setAttribute('dominant-baseline', 'middle');
      t.setAttribute('font-size', '12');
      root.appendChild(t);
      x += itemW[i];
    });
  }

  return { markup: new XMLSerializer().serializeToString(root), width: totalW, height: totalH };
}

function text(content: string, x: number, y: number, fill: string): SVGTextElement {
  const t = document.createElementNS(SVG_NS, 'text');
  t.setAttribute('x', String(x));
  t.setAttribute('y', String(y));
  t.setAttribute('fill', fill);
  t.textContent = content;
  return t;
}

export function svgBlob(svg: ExportedSvg): Blob {
  return new Blob([svg.markup], { type: 'image/svg+xml;charset=utf-8' });
}

/** Rasterise the standalone SVG at `scale`× onto a canvas. */
export async function pngBlob(svg: ExportedSvg, scale = 2): Promise<Blob> {
  const url = URL.createObjectURL(svgBlob(svg));
  try {
    const img = new Image();
    img.decoding = 'sync';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Could not render the chart image.'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(svg.width * scale);
    canvas.height = Math.round(svg.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available in this browser.');
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, svg.width, svg.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not encode the PNG.'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}
