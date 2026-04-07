import { useState } from 'react';
import { useImmer } from 'use-immer';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Copy, Check, Wand2, RotateCcw } from 'lucide-react';

// ─── Conversion helpers ─────────────────────────────────────────────────────

/** Parse a pixel or rem value and return a Tailwind spacing scale token, or null. */
function spacingToken(value: string): string | null {
  value = value.trim();
  if (value === '0' || value === '0px' || value === '0rem') return '0';
  if (value === '1px') return 'px';
  const pxMatch = value.match(/^([\d.]+)px$/);
  if (pxMatch) {
    const px = parseFloat(pxMatch[1]);
    return pxToSpacing(px);
  }
  const remMatch = value.match(/^([\d.]+)rem$/);
  if (remMatch) {
    const rem = parseFloat(remMatch[1]);
    return pxToSpacing(rem * 16);
  }
  // percentage → arbitrary or named fractions
  const pctMatch = value.match(/^([\d.]+)%$/);
  if (pctMatch) {
    const pct = parseFloat(pctMatch[1]);
    const fractions: Record<number, string> = { 50: '1/2', 33.333: '1/3', 66.666: '2/3', 25: '1/4', 75: '3/4', 20: '1/5', 40: '2/5', 60: '3/5', 80: '4/5', 100: 'full' };
    for (const [k, v] of Object.entries(fractions)) {
      if (Math.abs(pct - Number(k)) < 0.1) return v;
    }
    return `[${value}]`;
  }
  if (value === 'auto') return 'auto';
  if (value === '100%') return 'full';
  if (value === '100vw') return 'screen';
  if (value === '100vh') return 'screen';
  if (value === 'min-content') return 'min';
  if (value === 'max-content') return 'max';
  if (value === 'fit-content') return 'fit';
  return null;
}

function pxToSpacing(px: number): string {
  const scale: Record<number, string> = {
    0: '0', 1: 'px', 2: '0.5', 4: '1', 6: '1.5', 8: '2', 10: '2.5',
    12: '3', 14: '3.5', 16: '4', 20: '5', 24: '6', 28: '7', 32: '8',
    36: '9', 40: '10', 44: '11', 48: '12', 56: '14', 64: '16', 80: '20',
    96: '24', 112: '28', 128: '32', 144: '36', 160: '40', 176: '44',
    192: '48', 208: '52', 224: '56', 240: '60', 256: '64', 288: '72',
    320: '80', 384: '96',
  };
  if (scale[px] !== undefined) return scale[px];
  // Nearest match or arbitrary
  return `[${px}px]`;
}

function colorToTailwind(value: string): string {
  value = value.trim().toLowerCase();
  if (value === 'transparent') return 'transparent';
  if (value === 'white' || value === '#fff' || value === '#ffffff') return 'white';
  if (value === 'black' || value === '#000' || value === '#000000') return 'black';
  if (value === 'currentcolor' || value === 'currentColor') return 'current';
  if (value === 'inherit') return 'inherit';

  // Named CSS → Tailwind color palette mapping
  const named: Record<string, string> = {
    red: 'red-500', blue: 'blue-500', green: 'green-500', yellow: 'yellow-400',
    purple: 'purple-500', pink: 'pink-500', orange: 'orange-500', gray: 'gray-500',
    grey: 'gray-500', indigo: 'indigo-500', teal: 'teal-500', cyan: 'cyan-500',
    lime: 'lime-500', amber: 'amber-500', emerald: 'emerald-500', rose: 'rose-500',
    violet: 'violet-500', fuchsia: 'fuchsia-500', sky: 'sky-500', slate: 'slate-500',
    zinc: 'zinc-500', neutral: 'neutral-500', stone: 'stone-500',
  };
  if (named[value]) return named[value];

  // Try to match Tailwind hex palette
  const hex = normalizeHex(value);
  if (hex) {
    const match = findClosestTailwindColor(hex);
    if (match) return match;
    return `[${value}]`;
  }

  // rgb/rgba → arbitrary
  return `[${value}]`;
}

function normalizeHex(color: string): string | null {
  color = color.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(color)) return color;
  if (/^#[0-9a-f]{3}$/.test(color)) {
    return '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3];
  }
  return null;
}

// Subset of Tailwind color palette for matching
const TAILWIND_PALETTE: Record<string, string> = {
  // slate
  '#f8fafc': 'slate-50', '#f1f5f9': 'slate-100', '#e2e8f0': 'slate-200',
  '#cbd5e1': 'slate-300', '#94a3b8': 'slate-400', '#64748b': 'slate-500',
  '#475569': 'slate-600', '#334155': 'slate-700', '#1e293b': 'slate-800', '#0f172a': 'slate-900',
  // gray
  '#f9fafb': 'gray-50', '#f3f4f6': 'gray-100', '#e5e7eb': 'gray-200',
  '#d1d5db': 'gray-300', '#9ca3af': 'gray-400', '#6b7280': 'gray-500',
  '#4b5563': 'gray-600', '#374151': 'gray-700', '#1f2937': 'gray-800', '#111827': 'gray-900',
  // red
  '#fef2f2': 'red-50', '#fee2e2': 'red-100', '#fecaca': 'red-200',
  '#fca5a5': 'red-300', '#f87171': 'red-400', '#ef4444': 'red-500',
  '#dc2626': 'red-600', '#b91c1c': 'red-700', '#991b1b': 'red-800', '#7f1d1d': 'red-900',
  // orange
  '#fff7ed': 'orange-50', '#ffedd5': 'orange-100', '#fed7aa': 'orange-200',
  '#fdba74': 'orange-300', '#fb923c': 'orange-400', '#f97316': 'orange-500',
  '#ea580c': 'orange-600', '#c2410c': 'orange-700', '#9a3412': 'orange-800',
  // amber
  '#fffbeb': 'amber-50', '#fef3c7': 'amber-100', '#fde68a': 'amber-200',
  '#fcd34d': 'amber-300', '#fbbf24': 'amber-400', '#f59e0b': 'amber-500',
  '#d97706': 'amber-600', '#b45309': 'amber-700', '#92400e': 'amber-800',
  // yellow
  '#fefce8': 'yellow-50', '#fef9c3': 'yellow-100', '#fef08a': 'yellow-200',
  '#fde047': 'yellow-300', '#facc15': 'yellow-400', '#eab308': 'yellow-500',
  '#ca8a04': 'yellow-600', '#a16207': 'yellow-700', '#854d0e': 'yellow-800',
  // green
  '#f0fdf4': 'green-50', '#dcfce7': 'green-100', '#bbf7d0': 'green-200',
  '#86efac': 'green-300', '#4ade80': 'green-400', '#22c55e': 'green-500',
  '#16a34a': 'green-600', '#15803d': 'green-700', '#166534': 'green-800', '#14532d': 'green-900',
  // emerald
  '#ecfdf5': 'emerald-50', '#d1fae5': 'emerald-100', '#6ee7b7': 'emerald-300',
  '#34d399': 'emerald-400', '#10b981': 'emerald-500', '#059669': 'emerald-600',
  '#047857': 'emerald-700', '#065f46': 'emerald-800',
  // teal
  '#f0fdfa': 'teal-50', '#ccfbf1': 'teal-100', '#5eead4': 'teal-300',
  '#2dd4bf': 'teal-400', '#14b8a6': 'teal-500', '#0d9488': 'teal-600',
  '#0f766e': 'teal-700', '#115e59': 'teal-800',
  // cyan
  '#ecfeff': 'cyan-50', '#cffafe': 'cyan-100', '#67e8f9': 'cyan-300',
  '#22d3ee': 'cyan-400', '#06b6d4': 'cyan-500', '#0891b2': 'cyan-600',
  '#0e7490': 'cyan-700', '#155e75': 'cyan-800',
  // sky
  '#f0f9ff': 'sky-50', '#e0f2fe': 'sky-100', '#7dd3fc': 'sky-300',
  '#38bdf8': 'sky-400', '#0ea5e9': 'sky-500', '#0284c7': 'sky-600',
  '#0369a1': 'sky-700', '#075985': 'sky-800', '#0c4a6e': 'sky-900',
  // blue
  '#eff6ff': 'blue-50', '#dbeafe': 'blue-100', '#93c5fd': 'blue-300',
  '#60a5fa': 'blue-400', '#3b82f6': 'blue-500', '#2563eb': 'blue-600',
  '#1d4ed8': 'blue-700', '#1e40af': 'blue-800', '#1e3a8a': 'blue-900',
  // indigo
  '#eef2ff': 'indigo-50', '#e0e7ff': 'indigo-100', '#a5b4fc': 'indigo-300',
  '#818cf8': 'indigo-400', '#6366f1': 'indigo-500', '#4f46e5': 'indigo-600',
  '#4338ca': 'indigo-700', '#3730a3': 'indigo-800',
  // violet
  '#f5f3ff': 'violet-50', '#ede9fe': 'violet-100', '#c4b5fd': 'violet-300',
  '#a78bfa': 'violet-400', '#8b5cf6': 'violet-500', '#7c3aed': 'violet-600',
  '#6d28d9': 'violet-700', '#5b21b6': 'violet-800',
  // purple
  '#faf5ff': 'purple-50', '#f3e8ff': 'purple-100', '#d8b4fe': 'purple-300',
  '#c084fc': 'purple-400', '#a855f7': 'purple-500', '#9333ea': 'purple-600',
  '#7e22ce': 'purple-700', '#6b21a8': 'purple-800',
  // fuchsia
  '#fdf4ff': 'fuchsia-50', '#fae8ff': 'fuchsia-100', '#e879f9': 'fuchsia-400',
  '#d946ef': 'fuchsia-500', '#c026d3': 'fuchsia-600', '#a21caf': 'fuchsia-700',
  // pink
  '#fdf2f8': 'pink-50', '#fce7f3': 'pink-100', '#f9a8d4': 'pink-300',
  '#f472b6': 'pink-400', '#ec4899': 'pink-500', '#db2777': 'pink-600',
  '#be185d': 'pink-700', '#9d174d': 'pink-800',
  // rose
  '#fff1f2': 'rose-50', '#ffe4e6': 'rose-100', '#fda4af': 'rose-300',
  '#fb7185': 'rose-400', '#f43f5e': 'rose-500', '#e11d48': 'rose-600',
  '#be123c': 'rose-700', '#9f1239': 'rose-800',
};

function findClosestTailwindColor(hex: string): string | null {
  if (TAILWIND_PALETTE[hex]) return TAILWIND_PALETTE[hex];
  // Find closest by Euclidean distance in RGB
  const [r1, g1, b1] = hexToRgb(hex);
  let bestDist = Infinity;
  let bestName = '';
  for (const [paletteHex, name] of Object.entries(TAILWIND_PALETTE)) {
    const [r2, g2, b2] = hexToRgb(paletteHex);
    const dist = Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
    if (dist < bestDist) { bestDist = dist; bestName = name; }
  }
  // Only use if close enough (within ~15 units)
  return bestDist < 25 ? bestName : null;
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

/** Convert 4-value shorthand (top right bottom left) to Tailwind classes */
function shorthandSpacing(prefix: string, value: string): string[] {
  const parts = value.trim().split(/\s+/);
  if (parts.length === 1) {
    const t = spacingToken(parts[0]);
    if (t !== null) return [`${prefix}-${t}`];
    return [`${prefix}-[${parts[0]}]`];
  }
  if (parts.length === 2) {
    const ty = spacingToken(parts[0]);
    const tx = spacingToken(parts[1]);
    const classes: string[] = [];
    if (ty !== null) classes.push(`${prefix}y-${ty}`); else classes.push(`${prefix}y-[${parts[0]}]`);
    if (tx !== null) classes.push(`${prefix}x-${tx}`); else classes.push(`${prefix}x-[${parts[1]}]`);
    return classes;
  }
  if (parts.length === 3) {
    const [top, , bottom] = parts;
    const tt = spacingToken(top);
    const tx = spacingToken(parts[1]);
    const tb = spacingToken(bottom);
    const classes: string[] = [];
    if (tt !== null) classes.push(`${prefix}t-${tt}`); else classes.push(`${prefix}t-[${top}]`);
    if (tx !== null) classes.push(`${prefix}x-${tx}`); else classes.push(`${prefix}x-[${parts[1]}]`);
    if (tb !== null) classes.push(`${prefix}b-${tb}`); else classes.push(`${prefix}b-[${bottom}]`);
    return classes;
  }
  if (parts.length === 4) {
    const dirs = ['t', 'r', 'b', 'l'];
    return parts.map((p, i) => {
      const t = spacingToken(p);
      return t !== null ? `${prefix}${dirs[i]}-${t}` : `${prefix}${dirs[i]}-[${p}]`;
    });
  }
  return [`${prefix}-[${value}]`];
}

/** Convert a single CSS property+value to Tailwind classes */
function convertDeclaration(prop: string, value: string): string[] | null {
  prop = prop.trim().toLowerCase();
  value = value.trim();

  // ── Layout ──────────────────────────────────────────────────────────────
  if (prop === 'display') {
    const map: Record<string, string> = {
      flex: 'flex', 'inline-flex': 'inline-flex', grid: 'grid', 'inline-grid': 'inline-grid',
      block: 'block', 'inline-block': 'inline-block', inline: 'inline', none: 'hidden',
      table: 'table', 'table-cell': 'table-cell', 'table-row': 'table-row',
      'flow-root': 'flow-root', contents: 'contents', 'list-item': 'list-item',
    };
    return map[value] ? [map[value]] : null;
  }
  if (prop === 'position') {
    const map: Record<string, string> = {
      static: 'static', relative: 'relative', absolute: 'absolute',
      fixed: 'fixed', sticky: 'sticky',
    };
    return map[value] ? [map[value]] : null;
  }
  if (prop === 'overflow') {
    const map: Record<string, string> = {
      auto: 'overflow-auto', hidden: 'overflow-hidden', visible: 'overflow-visible',
      scroll: 'overflow-scroll', clip: 'overflow-clip',
    };
    return map[value] ? [map[value]] : null;
  }
  if (prop === 'overflow-x') {
    const map: Record<string, string> = {
      auto: 'overflow-x-auto', hidden: 'overflow-x-hidden', visible: 'overflow-x-visible',
      scroll: 'overflow-x-scroll',
    };
    return map[value] ? [map[value]] : null;
  }
  if (prop === 'overflow-y') {
    const map: Record<string, string> = {
      auto: 'overflow-y-auto', hidden: 'overflow-y-hidden', visible: 'overflow-y-visible',
      scroll: 'overflow-y-scroll',
    };
    return map[value] ? [map[value]] : null;
  }
  if (prop === 'visibility') {
    return value === 'hidden' ? ['invisible'] : value === 'visible' ? ['visible'] : value === 'collapse' ? ['collapse'] : null;
  }
  if (prop === 'z-index') {
    const map: Record<string, string> = { auto: 'z-auto', '0': 'z-0', '10': 'z-10', '20': 'z-20', '30': 'z-30', '40': 'z-40', '50': 'z-50' };
    return map[value] ? [map[value]] : [`z-[${value}]`];
  }
  if (prop === 'float') {
    const map: Record<string, string> = { left: 'float-left', right: 'float-right', none: 'float-none', start: 'float-start', end: 'float-end' };
    return map[value] ? [map[value]] : null;
  }
  if (prop === 'clear') {
    const map: Record<string, string> = { left: 'clear-left', right: 'clear-right', both: 'clear-both', none: 'clear-none' };
    return map[value] ? [map[value]] : null;
  }
  if (prop === 'box-sizing') {
    return value === 'border-box' ? ['box-border'] : value === 'content-box' ? ['box-content'] : null;
  }

  // ── Inset (top/right/bottom/left) ───────────────────────────────────────
  if (['top', 'right', 'bottom', 'left'].includes(prop)) {
    const map: Record<string, string> = { top: 't', right: 'r', bottom: 'b', left: 'l' };
    const dir = map[prop];
    if (value === 'auto') return [`inset-${dir}-auto`];
    const t = spacingToken(value);
    if (t !== null) return [value.startsWith('-') ? `-inset-${dir}-${t.slice(1)}` : `inset-${dir}-${t}`];
    return [`inset-${dir}-[${value}]`];
  }
  if (prop === 'inset') {
    const t = spacingToken(value);
    return t !== null ? [`inset-${t}`] : [`inset-[${value}]`];
  }

  // ── Spacing ─────────────────────────────────────────────────────────────
  if (prop === 'margin') return shorthandSpacing('m', value);
  if (prop === 'margin-top') { const t = spacingToken(value); return t !== null ? [`mt-${t}`] : [`mt-[${value}]`]; }
  if (prop === 'margin-right') { const t = spacingToken(value); return t !== null ? [`mr-${t}`] : [`mr-[${value}]`]; }
  if (prop === 'margin-bottom') { const t = spacingToken(value); return t !== null ? [`mb-${t}`] : [`mb-[${value}]`]; }
  if (prop === 'margin-left') { const t = spacingToken(value); return t !== null ? [`ml-${t}`] : [`ml-[${value}]`]; }
  if (prop === 'padding') return shorthandSpacing('p', value);
  if (prop === 'padding-top') { const t = spacingToken(value); return t !== null ? [`pt-${t}`] : [`pt-[${value}]`]; }
  if (prop === 'padding-right') { const t = spacingToken(value); return t !== null ? [`pr-${t}`] : [`pr-[${value}]`]; }
  if (prop === 'padding-bottom') { const t = spacingToken(value); return t !== null ? [`pb-${t}`] : [`pb-[${value}]`]; }
  if (prop === 'padding-left') { const t = spacingToken(value); return t !== null ? [`pl-${t}`] : [`pl-[${value}]`]; }
  if (prop === 'gap') {
    const parts = value.split(/\s+/);
    if (parts.length === 1) {
      const t = spacingToken(value);
      return t !== null ? [`gap-${t}`] : [`gap-[${value}]`];
    }
    const ty = spacingToken(parts[0]);
    const tx = spacingToken(parts[1]);
    return [
      ty !== null ? `gap-y-${ty}` : `gap-y-[${parts[0]}]`,
      tx !== null ? `gap-x-${tx}` : `gap-x-[${parts[1]}]`,
    ];
  }
  if (prop === 'column-gap' || prop === 'gap-x') {
    const t = spacingToken(value);
    return t !== null ? [`gap-x-${t}`] : [`gap-x-[${value}]`];
  }
  if (prop === 'row-gap' || prop === 'gap-y') {
    const t = spacingToken(value);
    return t !== null ? [`gap-y-${t}`] : [`gap-y-[${value}]`];
  }

  // ── Sizing ───────────────────────────────────────────────────────────────
  if (prop === 'width') {
    const t = spacingToken(value);
    return t !== null ? [`w-${t}`] : [`w-[${value}]`];
  }
  if (prop === 'height') {
    const t = spacingToken(value);
    if (value === '100vh') return ['h-screen'];
    if (value === '100dvh') return ['h-dvh'];
    return t !== null ? [`h-${t}`] : [`h-[${value}]`];
  }
  if (prop === 'min-width') {
    const map: Record<string, string> = { '0': 'min-w-0', 'full': 'min-w-full', 'min-content': 'min-w-min', 'max-content': 'min-w-max', 'fit-content': 'min-w-fit' };
    const t = spacingToken(value);
    return map[value] ? [map[value]] : t !== null ? [`min-w-${t}`] : [`min-w-[${value}]`];
  }
  if (prop === 'max-width') {
    const map: Record<string, string> = {
      none: 'max-w-none', '100%': 'max-w-full', '320px': 'max-w-xs', '384px': 'max-w-sm',
      '448px': 'max-w-md', '512px': 'max-w-lg', '576px': 'max-w-xl',
      '672px': 'max-w-2xl', '768px': 'max-w-3xl', '896px': 'max-w-4xl',
      '1024px': 'max-w-5xl', '1152px': 'max-w-6xl', '1280px': 'max-w-7xl',
      'min-content': 'max-w-min', 'max-content': 'max-w-max', 'fit-content': 'max-w-fit',
    };
    const t = spacingToken(value);
    return map[value] ? [map[value]] : t !== null ? [`max-w-${t}`] : [`max-w-[${value}]`];
  }
  if (prop === 'min-height') {
    const t = spacingToken(value);
    if (value === '100vh') return ['min-h-screen'];
    return t !== null ? [`min-h-${t}`] : [`min-h-[${value}]`];
  }
  if (prop === 'max-height') {
    const t = spacingToken(value);
    if (value === '100vh') return ['max-h-screen'];
    return t !== null ? [`max-h-${t}`] : [`max-h-[${value}]`];
  }

  // ── Typography ───────────────────────────────────────────────────────────
  if (prop === 'font-size') {
    const sizeMap: Record<string, string> = {
      '12px': 'text-xs', '0.75rem': 'text-xs',
      '14px': 'text-sm', '0.875rem': 'text-sm',
      '16px': 'text-base', '1rem': 'text-base',
      '18px': 'text-lg', '1.125rem': 'text-lg',
      '20px': 'text-xl', '1.25rem': 'text-xl',
      '24px': 'text-2xl', '1.5rem': 'text-2xl',
      '30px': 'text-3xl', '1.875rem': 'text-3xl',
      '36px': 'text-4xl', '2.25rem': 'text-4xl',
      '48px': 'text-5xl', '3rem': 'text-5xl',
      '60px': 'text-6xl', '3.75rem': 'text-6xl',
      '72px': 'text-7xl', '4.5rem': 'text-7xl',
      '96px': 'text-8xl', '6rem': 'text-8xl',
      '128px': 'text-9xl', '8rem': 'text-9xl',
    };
    return sizeMap[value] ? [sizeMap[value]] : [`text-[${value}]`];
  }
  if (prop === 'font-weight') {
    const map: Record<string, string> = {
      '100': 'font-thin', thin: 'font-thin',
      '200': 'font-extralight', extralight: 'font-extralight',
      '300': 'font-light', light: 'font-light',
      '400': 'font-normal', normal: 'font-normal',
      '500': 'font-medium', medium: 'font-medium',
      '600': 'font-semibold', semibold: 'font-semibold',
      '700': 'font-bold', bold: 'font-bold',
      '800': 'font-extrabold', extrabold: 'font-extrabold',
      '900': 'font-black', black: 'font-black',
    };
    return map[value] ? [map[value]] : [`font-[${value}]`];
  }
  if (prop === 'font-style') {
    return value === 'italic' ? ['italic'] : value === 'normal' ? ['not-italic'] : null;
  }
  if (prop === 'font-family') {
    const v = value.toLowerCase();
    if (v.includes('mono') || v.includes('courier') || v.includes('consolas')) return ['font-mono'];
    if (v.includes('serif') && !v.includes('sans')) return ['font-serif'];
    return ['font-sans'];
  }
  if (prop === 'text-align') {
    const map: Record<string, string> = {
      left: 'text-left', center: 'text-center', right: 'text-right',
      justify: 'text-justify', start: 'text-start', end: 'text-end',
    };
    return map[value] ? [map[value]] : null;
  }
  if (prop === 'text-transform') {
    const map: Record<string, string> = {
      uppercase: 'uppercase', lowercase: 'lowercase', capitalize: 'capitalize', none: 'normal-case',
    };
    return map[value] ? [map[value]] : null;
  }
  if (prop === 'text-decoration' || prop === 'text-decoration-line') {
    const map: Record<string, string> = {
      underline: 'underline', overline: 'overline', 'line-through': 'line-through', none: 'no-underline',
    };
    return map[value] ? [map[value]] : null;
  }
  if (prop === 'text-overflow') {
    return value === 'ellipsis' ? ['text-ellipsis truncate'] : value === 'clip' ? ['text-clip'] : null;
  }
  if (prop === 'white-space') {
    const map: Record<string, string> = {
      normal: 'whitespace-normal', nowrap: 'whitespace-nowrap', pre: 'whitespace-pre',
      'pre-wrap': 'whitespace-pre-wrap', 'pre-line': 'whitespace-pre-line',
      'break-spaces': 'whitespace-break-spaces',
    };
    return map[value] ? [map[value]] : null;
  }
  if (prop === 'word-break') {
    const map: Record<string, string> = {
      normal: 'break-normal', 'break-all': 'break-all', 'keep-all': 'break-keep',
    };
    return map[value] ? [map[value]] : null;
  }
  if (prop === 'overflow-wrap' || prop === 'word-wrap') {
    return value === 'break-word' ? ['break-words'] : value === 'normal' ? ['break-normal'] : null;
  }
  if (prop === 'line-height') {
    const map: Record<string, string> = {
      '1': 'leading-none', '1.25': 'leading-tight', '1.375': 'leading-snug',
      '1.5': 'leading-normal', '1.625': 'leading-relaxed', '2': 'leading-loose',
      normal: 'leading-normal',
    };
    if (map[value]) return [map[value]];
    const t = spacingToken(value);
    return t !== null ? [`leading-${t}`] : [`leading-[${value}]`];
  }
  if (prop === 'letter-spacing') {
    const map: Record<string, string> = {
      '-0.05em': 'tracking-tighter', '-0.025em': 'tracking-tight',
      '0em': 'tracking-normal', '0': 'tracking-normal',
      '0.025em': 'tracking-wide', '0.05em': 'tracking-wider', '0.1em': 'tracking-widest',
    };
    return map[value] ? [map[value]] : [`tracking-[${value}]`];
  }
  if (prop === 'vertical-align') {
    const map: Record<string, string> = {
      baseline: 'align-baseline', top: 'align-top', middle: 'align-middle',
      bottom: 'align-bottom', 'text-top': 'align-text-top', 'text-bottom': 'align-text-bottom',
      sub: 'align-sub', super: 'align-super',
    };
    return map[value] ? [map[value]] : null;
  }

  // ── Colors ───────────────────────────────────────────────────────────────
  if (prop === 'color') {
    const c = colorToTailwind(value);
    return [`text-${c}`];
  }
  if (prop === 'background-color' || prop === 'background') {
    if (value.startsWith('linear-gradient') || value.startsWith('radial-gradient')) {
      return [`bg-[${value}]`];
    }
    const c = colorToTailwind(value);
    return [`bg-${c}`];
  }
  if (prop === 'border-color') {
    const c = colorToTailwind(value);
    return [`border-${c}`];
  }
  if (prop === 'outline-color') {
    const c = colorToTailwind(value);
    return [`outline-${c}`];
  }
  if (prop === 'fill') {
    const c = colorToTailwind(value);
    return [`fill-${c}`];
  }
  if (prop === 'stroke') {
    const c = colorToTailwind(value);
    return [`stroke-${c}`];
  }
  if (prop === 'caret-color') {
    const c = colorToTailwind(value);
    return [`caret-${c}`];
  }
  if (prop === 'accent-color') {
    const c = colorToTailwind(value);
    return [`accent-${c}`];
  }

  // ── Border ───────────────────────────────────────────────────────────────
  if (prop === 'border-width') {
    const map: Record<string, string> = { '0': 'border-0', '1px': 'border', '2px': 'border-2', '4px': 'border-4', '8px': 'border-8' };
    return map[value] ? [map[value]] : [`border-[${value}]`];
  }
  if (prop === 'border-top-width') {
    const map: Record<string, string> = { '0': 'border-t-0', '1px': 'border-t', '2px': 'border-t-2', '4px': 'border-t-4', '8px': 'border-t-8' };
    return map[value] ? [map[value]] : [`border-t-[${value}]`];
  }
  if (prop === 'border-right-width') {
    const map: Record<string, string> = { '0': 'border-r-0', '1px': 'border-r', '2px': 'border-r-2', '4px': 'border-r-4', '8px': 'border-r-8' };
    return map[value] ? [map[value]] : [`border-r-[${value}]`];
  }
  if (prop === 'border-bottom-width') {
    const map: Record<string, string> = { '0': 'border-b-0', '1px': 'border-b', '2px': 'border-b-2', '4px': 'border-b-4', '8px': 'border-b-8' };
    return map[value] ? [map[value]] : [`border-b-[${value}]`];
  }
  if (prop === 'border-left-width') {
    const map: Record<string, string> = { '0': 'border-l-0', '1px': 'border-l', '2px': 'border-l-2', '4px': 'border-l-4', '8px': 'border-l-8' };
    return map[value] ? [map[value]] : [`border-l-[${value}]`];
  }
  if (prop === 'border-style') {
    const map: Record<string, string> = {
      solid: 'border-solid', dashed: 'border-dashed', dotted: 'border-dotted',
      double: 'border-double', hidden: 'border-hidden', none: 'border-none',
    };
    return map[value] ? [map[value]] : null;
  }
  if (prop === 'border') {
    if (value === 'none' || value === '0') return ['border-0'];
    const parts = value.split(/\s+/);
    const result: string[] = [];
    for (const part of parts) {
      if (/^\d+px$/.test(part)) {
        const map: Record<string, string> = { '1px': 'border', '2px': 'border-2', '4px': 'border-4', '8px': 'border-8' };
        result.push(map[part] ?? `border-[${part}]`);
      } else if (['solid', 'dashed', 'dotted', 'double', 'none'].includes(part)) {
        result.push(`border-${part}`);
      } else {
        const c = colorToTailwind(part);
        if (c !== part) result.push(`border-${c}`);
      }
    }
    return result.length ? result : null;
  }
  if (prop === 'border-radius') {
    const map: Record<string, string> = {
      '0': 'rounded-none', '0px': 'rounded-none',
      '2px': 'rounded-sm', '0.125rem': 'rounded-sm',
      '4px': 'rounded', '0.25rem': 'rounded',
      '6px': 'rounded-md', '0.375rem': 'rounded-md',
      '8px': 'rounded-lg', '0.5rem': 'rounded-lg',
      '12px': 'rounded-xl', '0.75rem': 'rounded-xl',
      '16px': 'rounded-2xl', '1rem': 'rounded-2xl',
      '24px': 'rounded-3xl', '1.5rem': 'rounded-3xl',
      '9999px': 'rounded-full', '50%': 'rounded-full',
    };
    return map[value] ? [map[value]] : [`rounded-[${value}]`];
  }
  if (prop === 'border-top-left-radius') return [`rounded-tl-[${value}]`];
  if (prop === 'border-top-right-radius') return [`rounded-tr-[${value}]`];
  if (prop === 'border-bottom-right-radius') return [`rounded-br-[${value}]`];
  if (prop === 'border-bottom-left-radius') return [`rounded-bl-[${value}]`];
  if (prop === 'outline') {
    if (value === 'none' || value === '0') return ['outline-none'];
    return null;
  }
  if (prop === 'outline-width') {
    const map: Record<string, string> = { '0': 'outline-0', '1px': 'outline-1', '2px': 'outline-2', '4px': 'outline-4', '8px': 'outline-8' };
    return map[value] ? [map[value]] : [`outline-[${value}]`];
  }
  if (prop === 'outline-style') {
    const map: Record<string, string> = { none: 'outline-none', solid: 'outline', dashed: 'outline-dashed', dotted: 'outline-dotted', double: 'outline-double' };
    return map[value] ? [map[value]] : null;
  }

  // ── Flexbox ──────────────────────────────────────────────────────────────
  if (prop === 'flex-direction') {
    const map: Record<string, string> = {
      row: 'flex-row', 'row-reverse': 'flex-row-reverse',
      column: 'flex-col', 'column-reverse': 'flex-col-reverse',
    };
    return map[value] ? [map[value]] : null;
  }
  if (prop === 'flex-wrap') {
    const map: Record<string, string> = { wrap: 'flex-wrap', nowrap: 'flex-nowrap', 'wrap-reverse': 'flex-wrap-reverse' };
    return map[value] ? [map[value]] : null;
  }
  if (prop === 'flex') {
    const map: Record<string, string> = { '1': 'flex-1', 'auto': 'flex-auto', none: 'flex-none', 'initial': 'flex-initial' };
    return map[value] ? [map[value]] : [`flex-[${value}]`];
  }
  if (prop === 'flex-grow') {
    return value === '1' ? ['grow'] : value === '0' ? ['grow-0'] : [`grow-[${value}]`];
  }
  if (prop === 'flex-shrink') {
    return value === '1' ? ['shrink'] : value === '0' ? ['shrink-0'] : [`shrink-[${value}]`];
  }
  if (prop === 'flex-basis') {
    const t = spacingToken(value);
    return t !== null ? [`basis-${t}`] : [`basis-[${value}]`];
  }
  if (prop === 'order') {
    const map: Record<string, string> = {
      '-9999': '-order-last', first: 'order-first', last: 'order-last',
      none: 'order-none', '0': 'order-none',
    };
    if (map[value]) return [map[value]];
    const n = parseInt(value);
    if (!isNaN(n) && n >= 1 && n <= 12) return [`order-${n}`];
    return [`order-[${value}]`];
  }

  // ── Alignment ────────────────────────────────────────────────────────────
  if (prop === 'align-items') {
    const map: Record<string, string> = {
      'flex-start': 'items-start', 'flex-end': 'items-end', center: 'items-center',
      baseline: 'items-baseline', stretch: 'items-stretch',
      start: 'items-start', end: 'items-end',
    };
    return map[value] ? [map[value]] : null;
  }
  if (prop === 'align-content') {
    const map: Record<string, string> = {
      'flex-start': 'content-start', 'flex-end': 'content-end', center: 'content-center',
      'space-between': 'content-between', 'space-around': 'content-around',
      'space-evenly': 'content-evenly', stretch: 'content-stretch', normal: 'content-normal',
      start: 'content-start', end: 'content-end',
    };
    return map[value] ? [map[value]] : null;
  }
  if (prop === 'align-self') {
    const map: Record<string, string> = {
      auto: 'self-auto', 'flex-start': 'self-start', 'flex-end': 'self-end',
      center: 'self-center', baseline: 'self-baseline', stretch: 'self-stretch',
      start: 'self-start', end: 'self-end',
    };
    return map[value] ? [map[value]] : null;
  }
  if (prop === 'justify-content') {
    const map: Record<string, string> = {
      'flex-start': 'justify-start', 'flex-end': 'justify-end', center: 'justify-center',
      'space-between': 'justify-between', 'space-around': 'justify-around',
      'space-evenly': 'justify-evenly', stretch: 'justify-stretch', normal: 'justify-normal',
      start: 'justify-start', end: 'justify-end',
    };
    return map[value] ? [map[value]] : null;
  }
  if (prop === 'justify-items') {
    const map: Record<string, string> = {
      start: 'justify-items-start', end: 'justify-items-end', center: 'justify-items-center', stretch: 'justify-items-stretch',
    };
    return map[value] ? [map[value]] : null;
  }
  if (prop === 'justify-self') {
    const map: Record<string, string> = {
      auto: 'justify-self-auto', start: 'justify-self-start', end: 'justify-self-end',
      center: 'justify-self-center', stretch: 'justify-self-stretch',
    };
    return map[value] ? [map[value]] : null;
  }
  if (prop === 'place-items') {
    const map: Record<string, string> = {
      start: 'place-items-start', end: 'place-items-end',
      center: 'place-items-center', stretch: 'place-items-stretch', baseline: 'place-items-baseline',
    };
    return map[value] ? [map[value]] : null;
  }
  if (prop === 'place-content') {
    const map: Record<string, string> = {
      center: 'place-content-center', start: 'place-content-start', end: 'place-content-end',
      'space-between': 'place-content-between', 'space-around': 'place-content-around',
      'space-evenly': 'place-content-evenly', stretch: 'place-content-stretch',
    };
    return map[value] ? [map[value]] : null;
  }

  // ── Grid ─────────────────────────────────────────────────────────────────
  if (prop === 'grid-template-columns') {
    const repeatMatch = value.match(/^repeat\((\d+),\s*(?:minmax\(0,\s*)?1fr\)?(?:\s*\))?$/);
    if (repeatMatch) return [`grid-cols-${repeatMatch[1]}`];
    if (value === 'none') return ['grid-cols-none'];
    if (value === 'subgrid') return ['grid-cols-subgrid'];
    return [`grid-cols-[${value.replace(/\s/g, '_')}]`];
  }
  if (prop === 'grid-template-rows') {
    const repeatMatch = value.match(/^repeat\((\d+),\s*(?:minmax\(0,\s*)?1fr\)?(?:\s*\))?$/);
    if (repeatMatch) return [`grid-rows-${repeatMatch[1]}`];
    if (value === 'none') return ['grid-rows-none'];
    return [`grid-rows-[${value.replace(/\s/g, '_')}]`];
  }
  if (prop === 'grid-column') {
    const map: Record<string, string> = { 'auto': 'col-auto', '1 / -1': 'col-span-full', 'span 1 / span 1': 'col-span-1' };
    if (map[value]) return [map[value]];
    const spanMatch = value.match(/^span\s+(\d+)/);
    if (spanMatch) return [`col-span-${spanMatch[1]}`];
    return [`col-[${value}]`];
  }
  if (prop === 'grid-row') {
    const spanMatch = value.match(/^span\s+(\d+)/);
    if (spanMatch) return [`row-span-${spanMatch[1]}`];
    if (value === 'auto') return ['row-auto'];
    if (value === '1 / -1') return ['row-span-full'];
    return [`row-[${value}]`];
  }
  if (prop === 'grid-column-start') {
    return value === 'auto' ? ['col-start-auto'] : [`col-start-${value}`];
  }
  if (prop === 'grid-column-end') {
    return value === 'auto' ? ['col-end-auto'] : [`col-end-${value}`];
  }
  if (prop === 'grid-row-start') {
    return value === 'auto' ? ['row-start-auto'] : [`row-start-${value}`];
  }
  if (prop === 'grid-row-end') {
    return value === 'auto' ? ['row-end-auto'] : [`row-end-${value}`];
  }
  if (prop === 'grid-auto-flow') {
    const map: Record<string, string> = { row: 'grid-flow-row', column: 'grid-flow-col', dense: 'grid-flow-dense', 'row dense': 'grid-flow-row-dense', 'column dense': 'grid-flow-col-dense' };
    return map[value] ? [map[value]] : null;
  }
  if (prop === 'grid-auto-columns') {
    const map: Record<string, string> = { auto: 'auto-cols-auto', 'min-content': 'auto-cols-min', 'max-content': 'auto-cols-max', 'minmax(0,1fr)': 'auto-cols-fr' };
    return map[value] ? [map[value]] : null;
  }
  if (prop === 'grid-auto-rows') {
    const map: Record<string, string> = { auto: 'auto-rows-auto', 'min-content': 'auto-rows-min', 'max-content': 'auto-rows-max', 'minmax(0,1fr)': 'auto-rows-fr' };
    return map[value] ? [map[value]] : null;
  }

  // ── Effects ──────────────────────────────────────────────────────────────
  if (prop === 'opacity') {
    const map: Record<string, string> = {
      '0': 'opacity-0', '0.05': 'opacity-5', '0.1': 'opacity-10', '0.15': 'opacity-15',
      '0.2': 'opacity-20', '0.25': 'opacity-25', '0.3': 'opacity-30', '0.35': 'opacity-35',
      '0.4': 'opacity-40', '0.45': 'opacity-45', '0.5': 'opacity-50', '0.55': 'opacity-55',
      '0.6': 'opacity-60', '0.65': 'opacity-65', '0.7': 'opacity-70', '0.75': 'opacity-75',
      '0.8': 'opacity-80', '0.85': 'opacity-85', '0.9': 'opacity-90', '0.95': 'opacity-95', '1': 'opacity-100',
    };
    // Also handle percentage notation
    if (value.endsWith('%')) {
      const pct = parseFloat(value);
      return [`opacity-${pct}`];
    }
    return map[value] ? [map[value]] : [`opacity-[${value}]`];
  }
  if (prop === 'box-shadow') {
    if (value === 'none') return ['shadow-none'];
    const map: Record<string, string> = {
      '0 1px 2px 0 rgb(0 0 0 / 0.05)': 'shadow-sm',
      '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)': 'shadow',
      '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)': 'shadow-md',
      '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)': 'shadow-lg',
      '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)': 'shadow-xl',
      '0 25px 50px -12px rgb(0 0 0 / 0.25)': 'shadow-2xl',
      'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)': 'shadow-inner',
    };
    return map[value] ? [map[value]] : [`shadow-[${value.replace(/\s/g, '_')}]`];
  }
  if (prop === 'mix-blend-mode') {
    return [`mix-blend-${value}`];
  }
  if (prop === 'background-blend-mode') {
    return [`bg-blend-${value}`];
  }

  // ── Filters ──────────────────────────────────────────────────────────────
  if (prop === 'filter') {
    if (value === 'none') return ['filter-none'];
    const blurMatch = value.match(/blur\((\d+)px\)/);
    if (blurMatch) {
      const px = parseInt(blurMatch[1]);
      const map: Record<number, string> = { 0: 'blur-none', 4: 'blur-sm', 8: 'blur', 12: 'blur-md', 16: 'blur-lg', 24: 'blur-xl', 40: 'blur-2xl', 64: 'blur-3xl' };
      return [map[px] ?? `blur-[${blurMatch[1]}px]`];
    }
    return [`[filter:${value}]`];
  }
  if (prop === 'backdrop-filter') {
    if (value === 'none') return ['backdrop-filter-none'];
    const blurMatch = value.match(/blur\((\d+)px\)/);
    if (blurMatch) return [`backdrop-blur-[${blurMatch[1]}px]`];
    return null;
  }

  // ── Transforms ───────────────────────────────────────────────────────────
  if (prop === 'transform') {
    if (value === 'none') return ['transform-none'];
    const scaleMatch = value.match(/^scale\(([\d.]+)\)$/);
    if (scaleMatch) return [`scale-[${scaleMatch[1]}]`];
    const rotateMatch = value.match(/^rotate\(([\d.-]+)deg\)$/);
    if (rotateMatch) {
      const map: Record<string, string> = { '0': 'rotate-0', '1': 'rotate-1', '2': 'rotate-2', '3': 'rotate-3', '6': 'rotate-6', '12': 'rotate-12', '45': 'rotate-45', '90': 'rotate-90', '180': 'rotate-180' };
      return [map[rotateMatch[1]] ?? `rotate-[${rotateMatch[1]}deg]`];
    }
    const translateXMatch = value.match(/^translateX\((.+)\)$/);
    if (translateXMatch) {
      const t = spacingToken(translateXMatch[1]);
      return t !== null ? [`translate-x-${t}`] : [`translate-x-[${translateXMatch[1]}]`];
    }
    const translateYMatch = value.match(/^translateY\((.+)\)$/);
    if (translateYMatch) {
      const t = spacingToken(translateYMatch[1]);
      return t !== null ? [`translate-y-${t}`] : [`translate-y-[${translateYMatch[1]}]`];
    }
    return null;
  }
  if (prop === 'rotate') {
    const map: Record<string, string> = { '0deg': 'rotate-0', '1deg': 'rotate-1', '2deg': 'rotate-2', '3deg': 'rotate-3', '6deg': 'rotate-6', '12deg': 'rotate-12', '45deg': 'rotate-45', '90deg': 'rotate-90', '180deg': 'rotate-180' };
    return map[value] ? [map[value]] : [`rotate-[${value}]`];
  }
  if (prop === 'scale') {
    const map: Record<string, string> = { '0': 'scale-0', '0.5': 'scale-50', '0.75': 'scale-75', '0.9': 'scale-90', '0.95': 'scale-95', '1': 'scale-100', '1.05': 'scale-105', '1.1': 'scale-110', '1.25': 'scale-125', '1.5': 'scale-150' };
    return map[value] ? [map[value]] : [`scale-[${value}]`];
  }

  // ── Transitions & Animation ───────────────────────────────────────────────
  if (prop === 'transition') {
    if (value === 'none') return ['transition-none'];
    if (value.includes('all')) return ['transition-all'];
    if (value.includes('color') || value.includes('background') || value.includes('border')) return ['transition-colors'];
    if (value.includes('opacity')) return ['transition-opacity'];
    if (value.includes('shadow')) return ['transition-shadow'];
    if (value.includes('transform')) return ['transition-transform'];
    return ['transition'];
  }
  if (prop === 'transition-duration') {
    const map: Record<string, string> = { '75ms': 'duration-75', '100ms': 'duration-100', '150ms': 'duration-150', '200ms': 'duration-200', '300ms': 'duration-300', '500ms': 'duration-500', '700ms': 'duration-700', '1000ms': 'duration-1000', '1s': 'duration-1000' };
    return map[value] ? [map[value]] : [`duration-[${value}]`];
  }
  if (prop === 'transition-timing-function') {
    const map: Record<string, string> = {
      linear: 'ease-linear', ease: 'ease',
      'ease-in': 'ease-in', 'ease-out': 'ease-out', 'ease-in-out': 'ease-in-out',
    };
    return map[value] ? [map[value]] : [`ease-[${value}]`];
  }
  if (prop === 'transition-delay') {
    const map: Record<string, string> = { '0ms': 'delay-0', '75ms': 'delay-75', '100ms': 'delay-100', '150ms': 'delay-150', '200ms': 'delay-200', '300ms': 'delay-300', '500ms': 'delay-500', '700ms': 'delay-700', '1000ms': 'delay-1000' };
    return map[value] ? [map[value]] : [`delay-[${value}]`];
  }
  if (prop === 'animation') {
    if (value === 'none') return ['animate-none'];
    if (value.includes('spin')) return ['animate-spin'];
    if (value.includes('ping')) return ['animate-ping'];
    if (value.includes('pulse')) return ['animate-pulse'];
    if (value.includes('bounce')) return ['animate-bounce'];
    return null;
  }

  // ── Interaction ───────────────────────────────────────────────────────────
  if (prop === 'cursor') {
    const map: Record<string, string> = {
      auto: 'cursor-auto', default: 'cursor-default', pointer: 'cursor-pointer',
      wait: 'cursor-wait', text: 'cursor-text', move: 'cursor-move', help: 'cursor-help',
      'not-allowed': 'cursor-not-allowed', none: 'cursor-none', progress: 'cursor-progress',
      'cell': 'cursor-cell', 'crosshair': 'cursor-crosshair', 'vertical-text': 'cursor-vertical-text',
      alias: 'cursor-alias', copy: 'cursor-copy', 'no-drop': 'cursor-no-drop', grab: 'cursor-grab',
      grabbing: 'cursor-grabbing', 'all-scroll': 'cursor-all-scroll',
      'col-resize': 'cursor-col-resize', 'row-resize': 'cursor-row-resize',
      'n-resize': 'cursor-n-resize', 'e-resize': 'cursor-e-resize',
      'zoom-in': 'cursor-zoom-in', 'zoom-out': 'cursor-zoom-out',
    };
    return map[value] ? [map[value]] : [`cursor-[${value}]`];
  }
  if (prop === 'pointer-events') {
    return value === 'none' ? ['pointer-events-none'] : value === 'auto' ? ['pointer-events-auto'] : null;
  }
  if (prop === 'user-select') {
    const map: Record<string, string> = { none: 'select-none', text: 'select-text', all: 'select-all', auto: 'select-auto' };
    return map[value] ? [map[value]] : null;
  }
  if (prop === 'resize') {
    const map: Record<string, string> = { none: 'resize-none', both: 'resize', vertical: 'resize-y', horizontal: 'resize-x' };
    return map[value] ? [map[value]] : null;
  }
  if (prop === 'appearance') {
    return value === 'none' ? ['appearance-none'] : value === 'auto' ? ['appearance-auto'] : null;
  }
  if (prop === 'scroll-behavior') {
    return value === 'smooth' ? ['scroll-smooth'] : value === 'auto' ? ['scroll-auto'] : null;
  }

  // ── List ─────────────────────────────────────────────────────────────────
  if (prop === 'list-style-type') {
    const map: Record<string, string> = { none: 'list-none', disc: 'list-disc', decimal: 'list-decimal' };
    return map[value] ? [map[value]] : [`list-[${value}]`];
  }
  if (prop === 'list-style-position') {
    return value === 'inside' ? ['list-inside'] : value === 'outside' ? ['list-outside'] : null;
  }

  // ── Table ─────────────────────────────────────────────────────────────────
  if (prop === 'border-collapse') {
    return value === 'collapse' ? ['border-collapse'] : value === 'separate' ? ['border-separate'] : null;
  }
  if (prop === 'table-layout') {
    return value === 'fixed' ? ['table-fixed'] : value === 'auto' ? ['table-auto'] : null;
  }

  // ── Object ────────────────────────────────────────────────────────────────
  if (prop === 'object-fit') {
    const map: Record<string, string> = { contain: 'object-contain', cover: 'object-cover', fill: 'object-fill', none: 'object-none', 'scale-down': 'object-scale-down' };
    return map[value] ? [map[value]] : null;
  }
  if (prop === 'object-position') {
    const map: Record<string, string> = {
      'bottom': 'object-bottom', center: 'object-center', left: 'object-left',
      'left bottom': 'object-left-bottom', 'left top': 'object-left-top',
      right: 'object-right', 'right bottom': 'object-right-bottom', 'right top': 'object-right-top', top: 'object-top',
    };
    return map[value] ? [map[value]] : [`object-[${value}]`];
  }

  // ── Image rendering ───────────────────────────────────────────────────────
  if (prop === 'image-rendering') {
    return value === 'pixelated' ? ['image-pixelated'] : value === 'auto' ? ['image-auto'] : null;
  }

  // ── SVG ───────────────────────────────────────────────────────────────────
  if (prop === 'stroke-width') {
    const map: Record<string, string> = { '0': 'stroke-0', '1': 'stroke-1', '2': 'stroke-2' };
    return map[value] ? [map[value]] : [`stroke-[${value}]`];
  }

  return null;
}

// ─── CSS Parser ─────────────────────────────────────────────────────────────

type ParseToken =
  | { type: 'decl'; prop: string; value: string }
  | { type: 'comment'; text: string };

interface ParsedRule {
  selector: string | null;
  tokens: ParseToken[];
}

/** Tokenize a CSS block preserving comments in order */
function tokenizeBlock(block: string): ParseToken[] {
  const tokens: ParseToken[] = [];
  let i = 0;
  let current = '';

  while (i < block.length) {
    if (block[i] === '/' && block[i + 1] === '*') {
      const stmt = current.trim();
      if (stmt) {
        const d = parseOneDecl(stmt);
        if (d) tokens.push({ type: 'decl', ...d });
      }
      current = '';
      i += 2;
      let comment = '';
      while (i < block.length && !(block[i] === '*' && block[i + 1] === '/')) {
        comment += block[i++];
      }
      i += 2;
      const text = comment.trim();
      if (text) tokens.push({ type: 'comment', text });
    } else if (block[i] === ';') {
      const stmt = current.trim();
      if (stmt) {
        const d = parseOneDecl(stmt);
        if (d) tokens.push({ type: 'decl', ...d });
      }
      current = '';
      i++;
    } else {
      current += block[i++];
    }
  }
  const stmt = current.trim();
  if (stmt) {
    const d = parseOneDecl(stmt);
    if (d) tokens.push({ type: 'decl', ...d });
  }
  return tokens;
}

function parseOneDecl(stmt: string): { prop: string; value: string } | null {
  const colonIdx = stmt.indexOf(':');
  if (colonIdx === -1) return null;
  const prop = stmt.slice(0, colonIdx).trim();
  const value = stmt.slice(colonIdx + 1).trim().replace(/\s*!important\s*$/, '');
  if (!prop || !value) return null;
  return { prop, value };
}

function parseCSS(css: string): ParsedRule[] {
  const rules: ParsedRule[] = [];
  if (css.includes('{')) {
    const ruleRegex = /([^{]+)\{([^}]*)\}/g;
    let match;
    while ((match = ruleRegex.exec(css)) !== null) {
      rules.push({ selector: match[1].trim(), tokens: tokenizeBlock(match[2]) });
    }
  } else {
    rules.push({ selector: null, tokens: tokenizeBlock(css) });
  }
  return rules;
}

// ─── Figma Token Helpers ─────────────────────────────────────────────────────

/**
 * Detect Figma typography comments like "New/Paragraph/P1 Regular".
 * Must have at least one slash, only word chars/spaces — no URLs or percentages.
 */
function isTypographyPath(text: string): boolean {
  return /^[a-zA-Z][\w\s]*\/[\w\s/]+$/.test(text.trim());
}

/**
 * "New/Paragraph/P1 Regular" → "paragraph-p1-regular"
 * Skips the first segment (namespace like "New", "Base") and kebab-cases the rest.
 */
function typographyPathToClass(text: string): string {
  const segments = text.split('/').map(s => s.trim()).filter(Boolean);
  const relevant = segments.length > 1 ? segments.slice(1) : segments;
  return relevant
    .join('-')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

/**
 * If the CSS value is var(--Token-Name, fallback), return the Tailwind-style
 * token class for the given property — e.g. color: var(--Cool-grey-30) → "text-cool-grey-30"
 */
function varValueToClass(prop: string, value: string): string | null {
  const m = value.match(/^var\(\s*(--[^,)]+?)\s*(?:,[\s\S]*)?\)$/);
  if (!m) return null;
  const varName = m[1].replace(/^--/, '').toLowerCase();
  const propToPrefix: Record<string, string> = {
    'color': 'text',
    'background-color': 'bg',
    'background': 'bg',
    'border-color': 'border',
    'border-top-color': 'border-t',
    'border-right-color': 'border-r',
    'border-bottom-color': 'border-b',
    'border-left-color': 'border-l',
    'outline-color': 'outline',
    'fill': 'fill',
    'stroke': 'stroke',
    'caret-color': 'caret',
    'accent-color': 'accent',
    'text-decoration-color': 'decoration',
  };
  const twPrefix = propToPrefix[prop.toLowerCase()];
  if (!twPrefix) return null;
  return `${twPrefix}-${varName}`;
}

// Font-related properties that get collapsed under a typography comment token
const FONT_PROPS = new Set([
  'font-family', 'font-size', 'font-style', 'font-weight',
  'line-height', 'letter-spacing', 'font-variant',
]);

// ─── Main Converter ──────────────────────────────────────────────────────────

type ClassKind = 'tailwind' | 'var-token' | 'typography-token';

interface ClassEntry {
  cls: string;
  kind: ClassKind;
}

interface ConvertResult {
  selector: string | null;
  entries: ClassEntry[];
  unrecognized: string[];
}

function applyPrefix(cls: string, prefix: string): string {
  if (!prefix) return cls;
  return cls.split(/\s+/).map(c => `${prefix}${c}`).join(' ');
}

function convertCSS(css: string, prefix: string): ConvertResult[] {
  const rules = parseCSS(css);
  return rules.map(rule => {
    const entries: ClassEntry[] = [];
    const unrecognized: string[] = [];
    const { tokens } = rule;
    let i = 0;

    while (i < tokens.length) {
      const token = tokens[i];

      if (token.type === 'comment') {
        if (isTypographyPath(token.text)) {
          // Look ahead: consume font declarations, skipping over informational
          // inline comments like /* 166.667% */ that sit between properties
          let j = i + 1;
          while (j < tokens.length) {
            const t = tokens[j];
            if (t.type === 'decl' && FONT_PROPS.has(t.prop)) { j++; }
            else if (t.type === 'comment' && !isTypographyPath(t.text)) { j++; }
            else break;
          }
          if (j > i + 1) {
            const cls = applyPrefix(typographyPathToClass(token.text), prefix);
            entries.push({ cls, kind: 'typography-token' });
            i = j;
            continue;
          }
        }
        i++;
        continue;
      }

      // Declaration
      const { prop, value } = token;

      // Figma CSS variable → design token class
      const varCls = varValueToClass(prop, value);
      if (varCls !== null) {
        entries.push({ cls: applyPrefix(varCls, prefix), kind: 'var-token' });
        i++;
        continue;
      }

      // Standard Tailwind conversion
      const result = convertDeclaration(prop, value);
      if (result !== null) {
        for (const cls of result) {
          const prefixed = applyPrefix(cls, prefix);
          prefixed.split(/\s+/).filter(Boolean).forEach(c =>
            entries.push({ cls: c, kind: 'tailwind' })
          );
        }
      } else {
        unrecognized.push(`${prop}: ${value}`);
      }
      i++;
    }

    return { selector: rule.selector, entries, unrecognized };
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

const EXAMPLE_CSS = `.label {
  color: var(--Cool-grey-30, #E0E4EC);
  /* New/Paragraph/P1 Regular */
  font-family: "Open Sans";
  font-size: 0.75rem;
  font-style: normal;
  font-weight: 700;
  line-height: 1.25rem; /* 166.667% */
  letter-spacing: 0.01563rem;
}

.card {
  display: flex;
  flex-direction: column;
  padding: 24px;
  background-color: var(--Surface-default, #ffffff);
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  gap: 12px;
  max-width: 448px;
}`;

interface State {
  input: string;
  prefix: string;
  results: ConvertResult[];
  copied: boolean;
  converted: boolean;
}

export default function CSSToTailwindTool() {
  const [state, update] = useImmer<State>({
    input: EXAMPLE_CSS,
    prefix: '',
    results: [],
    copied: false,
    converted: false,
  });

  function handleConvert() {
    const results = convertCSS(state.input, state.prefix.trim());
    update(d => { d.results = results; d.converted = true; });
  }

  function handleReset() {
    update(d => { d.input = EXAMPLE_CSS; d.prefix = ''; d.results = []; d.converted = false; });
  }

  const hasUnrecognized = state.results.some(r => r.unrecognized.length > 0);
  const multipleSelectors = state.results.length > 1;
  const hasTokens = state.results.some(r => r.entries.some(e => e.kind !== 'tailwind'));

  function formatOutput(): string {
    if (!state.results.length) return '';
    if (!multipleSelectors) {
      const { entries, unrecognized } = state.results[0];
      const lines: string[] = [];
      if (entries.length) lines.push(entries.map(e => e.cls).join(' '));
      if (unrecognized.length) {
        lines.push('');
        lines.push('/* Unrecognized properties — convert manually: */');
        unrecognized.forEach(u => lines.push(`/* ${u}; */`));
      }
      return lines.join('\n');
    }
    return state.results
      .map(r => {
        const lines: string[] = [];
        if (r.selector) lines.push(`/* ${r.selector} */`);
        if (r.entries.length) lines.push(r.entries.map(e => e.cls).join(' '));
        if (r.unrecognized.length) {
          lines.push('/* Unrecognized:');
          r.unrecognized.forEach(u => lines.push(`   ${u};`));
          lines.push('*/');
        }
        return lines.join('\n');
      })
      .join('\n\n');
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(formatOutput());
    update(d => { d.copied = true; });
    setTimeout(() => update(d => { d.copied = false; }), 2000);
  }

  const outputText = formatOutput();

  return (
    <div className="space-y-6">
      {/* Options bar */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="prefix">Class prefix <span className="text-xs text-gray-400 font-normal">(e.g. <code>tw-</code> for Tailwind's <code>prefix</code> config)</span></Label>
              <Input
                id="prefix"
                value={state.prefix}
                onChange={e => update(d => { d.prefix = e.target.value; })}
                placeholder="Leave blank for no prefix"
                className="font-mono"
              />
            </div>
            <div className="flex gap-2 pb-0.5">
              <Button onClick={handleConvert} className="gap-2">
                <Wand2 className="w-4 h-4" /> Convert
              </Button>
              <Button variant="secondary" onClick={handleReset} className="gap-2">
                <RotateCcw className="w-4 h-4" /> Reset
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Editor area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Input */}
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-gray-500">CSS Input</Label>
          <textarea
            value={state.input}
            onChange={e => update(d => { d.input = e.target.value; d.converted = false; })}
            spellCheck={false}
            className="w-full h-96 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 text-sm font-mono text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:border-transparent resize-none transition-all"
            placeholder="Paste your CSS here…&#10;&#10;.button {&#10;  padding: 12px 24px;&#10;  background-color: #3b82f6;&#10;}"
          />
        </div>

        {/* Output */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs uppercase tracking-wide text-gray-500">Tailwind Classes</Label>
            {state.converted && outputText && (
              <Button variant="ghost" size="sm" onClick={handleCopy} className="gap-1.5 h-7 px-2 text-xs">
                {state.copied ? <><Check className="w-3 h-3 text-green-500" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
              </Button>
            )}
          </div>
          <div className="relative w-full h-96 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/60 overflow-auto">
            {!state.converted ? (
              <p className="absolute inset-0 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500 select-none">
                Click Convert to see results
              </p>
            ) : !outputText ? (
              <p className="absolute inset-0 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500 select-none">
                No output — check your CSS input
              </p>
            ) : (
              <div className="p-4 space-y-4">
                {state.results.map((result, i) => (
                  <div key={i} className="space-y-1.5">
                    {multipleSelectors && result.selector && (
                      <p className="text-xs text-brand-600 dark:text-brand-400 font-mono font-semibold">{result.selector}</p>
                    )}
                    {result.entries.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {result.entries.map((entry, j) => {
                          const badgeClass =
                            entry.kind === 'var-token'
                              ? 'bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800'
                              : entry.kind === 'typography-token'
                              ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                              : 'bg-brand-50 dark:bg-brand-950 text-brand-700 dark:text-brand-300 border-brand-200 dark:border-brand-800';
                          return (
                            <span key={j} className={`inline-block border rounded px-1.5 py-0.5 text-xs font-mono ${badgeClass}`}>
                              {entry.cls}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {result.unrecognized.length > 0 && (
                      <div className="mt-1 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
                        <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">No Tailwind equivalent found:</p>
                        {result.unrecognized.map((u, j) => (
                          <p key={j} className="text-xs font-mono text-amber-600 dark:text-amber-400">/* {u}; */</p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats bar */}
      {state.converted && state.results.length > 0 && (
        <div className="flex flex-wrap gap-3 text-sm text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-brand-400"></span>
            {state.results.reduce((s, r) => s + r.entries.filter(e => e.kind === 'tailwind').length, 0)} Tailwind classes
          </span>
          {hasTokens && (
            <>
              {state.results.reduce((s, r) => s + r.entries.filter(e => e.kind === 'var-token').length, 0) > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-purple-400"></span>
                  {state.results.reduce((s, r) => s + r.entries.filter(e => e.kind === 'var-token').length, 0)} color tokens
                </span>
              )}
              {state.results.reduce((s, r) => s + r.entries.filter(e => e.kind === 'typography-token').length, 0) > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-400"></span>
                  {state.results.reduce((s, r) => s + r.entries.filter(e => e.kind === 'typography-token').length, 0)} typography tokens
                </span>
              )}
            </>
          )}
          {hasUnrecognized && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-amber-400"></span>
              {state.results.reduce((s, r) => s + r.unrecognized.length, 0)} need manual conversion
            </span>
          )}
          {multipleSelectors && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-gray-400"></span>
              {state.results.length} selectors
            </span>
          )}
        </div>
      )}
    </div>
  );
}
