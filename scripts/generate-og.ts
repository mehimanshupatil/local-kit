/**
 * OG image generator — run with:  pnpm generate-og
 * Outputs 1200×630 PNG per page to public/og/
 * Re-run whenever tools are added or the template changes.
 */

import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { categories } from '../src/data/tools.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..');
const OUT_DIR   = resolve(ROOT, 'public/og');

mkdirSync(OUT_DIR, { recursive: true });

// Static Geist TTF from the geist npm package (satori doesn't support woff2 or variable fonts)
const geistPkg  = resolve(ROOT, 'node_modules/geist/dist/fonts/geist-sans');
const FONTS = [
  { name: 'Geist', data: readFileSync(resolve(geistPkg, 'Geist-Regular.ttf')), weight: 400 as const, style: 'normal' as const },
  { name: 'Geist', data: readFileSync(resolve(geistPkg, 'Geist-Medium.ttf')),  weight: 500 as const, style: 'normal' as const },
  { name: 'Geist', data: readFileSync(resolve(geistPkg, 'Geist-Bold.ttf')),    weight: 700 as const, style: 'normal' as const },
];

const W = 1200;
const H = 630;

const CATEGORY_COLORS: Record<string, string> = {
  pdf:     '#ef4444',
  image:   '#f97316',
  video:   '#a855f7',
  audio:   '#ec4899',
  ocr:     '#eab308',
  dev:     '#3b82f6',
  archive: '#f59e0b',
};

/** Convert href → filename: /pdf/merge → pdf-merge.png */
function hrefToFilename(href: string): string {
  return href.replace(/^\//, '').replace(/\//g, '-') + '.png';
}

// Satori only accepts React-element-like plain objects
type El = { type: string; props: Record<string, unknown> };
function div(style: Record<string, unknown>, children: (El | string)[]): El {
  return { type: 'div', props: { style: { display: 'flex', ...style }, children } };
}
function text(content: string, style: Record<string, unknown>): El {
  return { type: 'div', props: { style: { display: 'flex', ...style }, children: content } };
}

async function renderPng(el: El): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svg = await satori(el as any, { width: W, height: H, fonts: FONTS });
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: W } });
  return Buffer.from(resvg.render().asPng());
}

// ── Shared elements ───────────────────────────────────────────────────────────

function accentBar(color: string): El {
  return div({ width: 8, height: H, background: color, flexShrink: 0 }, []);
}

function footer(): El {
  return div({ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, [
    text('LocalKit', { fontSize: 22, color: '#525252', fontWeight: 600, letterSpacing: -0.5 }),
    div({
      flexDirection: 'row', alignItems: 'center',
      background: '#10b98120', border: '1px solid #10b98135',
      borderRadius: 6, padding: '6px 14px',
      fontSize: 15, color: '#10b981', fontWeight: 500,
    }, [text('100% Private · Runs Locally', {})]),
  ]);
}

// ── Tool card ─────────────────────────────────────────────────────────────────

function toolCard(toolName: string, description: string, categoryTitle: string, categoryId: string): El {
  const accent = CATEGORY_COLORS[categoryId] ?? '#10b981';
  return div({ flexDirection: 'row', width: W, height: H, background: '#080808', fontFamily: 'Geist' }, [
    accentBar(accent),
    div({ flex: 1, flexDirection: 'column', justifyContent: 'space-between', padding: '52px 72px 48px 64px' }, [
      // Category badge
      div({ flexDirection: 'row', alignItems: 'center', gap: 10,
            background: accent + '20', border: `1px solid ${accent}40`,
            borderRadius: 6, padding: '6px 14px', alignSelf: 'flex-start' }, [
        div({ width: 8, height: 8, borderRadius: 4, background: accent }, []),
        text(categoryTitle.toUpperCase(), { fontSize: 15, color: accent, fontWeight: 500, letterSpacing: 1 }),
      ]),
      // Tool name + description
      div({ flexDirection: 'column', gap: 16 }, [
        text(toolName,    { fontSize: 72, fontWeight: 700, color: '#ededed', lineHeight: 1.1, letterSpacing: -1 }),
        text(description, { fontSize: 28, color: '#737373', lineHeight: 1.4 }),
      ]),
      footer(),
    ]),
  ]);
}

// ── Category card ─────────────────────────────────────────────────────────────

function categoryCard(
  categoryTitle: string, categoryId: string,
  subheading: string, toolNames: string[],
): El {
  const accent = CATEGORY_COLORS[categoryId] ?? '#10b981';
  const shown  = toolNames.slice(0, 12);

  return div({ flexDirection: 'row', width: W, height: H, background: '#080808', fontFamily: 'Geist' }, [
    accentBar(accent),
    div({ flex: 1, flexDirection: 'column', justifyContent: 'space-between', padding: '48px 72px 44px 64px' }, [
      // Header
      div({ flexDirection: 'column', gap: 12 }, [
        text(categoryTitle, { fontSize: 78, fontWeight: 700, color: '#ededed', lineHeight: 1, letterSpacing: -2 }),
        text(subheading,    { fontSize: 22, color: '#737373', maxWidth: 700 }),
      ]),
      // Tool pills
      div({ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, shown.map(name =>
        div({ background: '#1a1a1a', border: '1px solid #262626', borderRadius: 6,
              padding: '6px 16px', fontSize: 16, color: '#a3a3a3' }, [name])
      )),
      footer(),
    ]),
  ]);
}

// ── Home card ─────────────────────────────────────────────────────────────────

function homeCard(): El {
  return div({ flexDirection: 'row', width: W, height: H, background: '#080808', fontFamily: 'Geist' }, [
    accentBar('#10b981'),
    div({ flex: 1, flexDirection: 'column', justifyContent: 'center', padding: '60px 80px', gap: 20 }, [
      text('LocalKit',                          { fontSize: 88, fontWeight: 700, color: '#ededed', letterSpacing: -3, lineHeight: 1 }),
      text('Privacy-first browser file tools',  { fontSize: 32, color: '#10b981', fontWeight: 500 }),
      text('PDF, image, video, audio and developer tools — 100% in your browser. No uploads, no servers.',
           { fontSize: 22, color: '#737373', lineHeight: 1.5, maxWidth: 700 }),
    ]),
  ]);
}

// ── Generate all ─────────────────────────────────────────────────────────────

let count = 0;
async function write(filename: string, el: El) {
  const png = await renderPng(el);
  writeFileSync(resolve(OUT_DIR, filename), png);
  process.stdout.write(`  ✓ ${filename}\n`);
  count++;
}

console.log('\nGenerating OG images → public/og/\n');

await write('home.png', homeCard());

for (const cat of categories) {
  await write(cat.id + '.png', categoryCard(cat.title, cat.id, cat.subheading, cat.tools.map(t => t.name)));
}

for (const cat of categories) {
  for (const tool of cat.tools) {
    await write(hrefToFilename(tool.href), toolCard(tool.name, tool.desc, cat.title, cat.id));
  }
}

console.log(`\n✓ Generated ${count} OG images\n`);
