import { describe, expect, it } from 'vitest';
import { convertCSS } from './cssToTailwind';

/** Classes per selector, for compact assertions. */
function classes(css: string, prefix = '') {
  return Object.fromEntries(
    convertCSS(css, prefix).map(r => [r.selector ?? '', r.entries.map(e => e.cls)]),
  );
}

describe('convertCSS — plain rules', () => {
  it('converts bare declarations with no selector', () => {
    expect(classes('display: flex; padding: 16px')).toEqual({ '': ['flex', 'p-4'] });
  });

  it('converts multiple rules independently', () => {
    expect(classes('.a { display: flex } .b { display: block }')).toEqual({ '.a': ['flex'], '.b': ['block'] });
  });

  it('ignores comments between rules', () => {
    expect(classes('/* header */\n.a { display: flex }')).toEqual({ '.a': ['flex'] });
  });

  it('maps dynamic viewport units', () => {
    expect(classes('.a { min-height: 100dvh; width: 100dvw }')).toEqual({ '.a': ['min-h-dvh', 'w-dvw'] });
  });
});

describe('convertCSS — @media', () => {
  it('converts rules nested in a max-width media query to max-* variants', () => {
    const css = `@media only screen and (max-width: 768px) {
  .appContainer {
    width: 100vw;
    height: 100dvh;
  }
}`;
    expect(classes(css)).toEqual({ '.appContainer': ['max-md:w-screen', 'max-md:h-dvh'] });
  });

  it('merges media rules into the base rule for the same selector', () => {
    const css = `.a { display: flex }
@media (min-width: 1024px) { .a { display: grid } }`;
    expect(classes(css)).toEqual({ '.a': ['flex', 'lg:grid'] });
  });

  it('maps max-width: 767px to the breakpoint below it', () => {
    expect(classes('@media (max-width: 767px) { .a { display: none } }')).toEqual({ '.a': ['max-md:hidden'] });
  });

  it('uses arbitrary breakpoints for non-standard widths', () => {
    expect(classes('@media (min-width: 900px) { .a { display: none } }')).toEqual({ '.a': ['min-[900px]:hidden'] });
  });

  it('converts rem breakpoints', () => {
    expect(classes('@media (min-width: 40rem) { .a { display: none } }')).toEqual({ '.a': ['sm:hidden'] });
  });

  it('stacks min and max width as a range', () => {
    const css = '@media (max-width: 1023px) and (min-width: 768px) { .a { display: none } }';
    expect(classes(css)).toEqual({ '.a': ['md:max-lg:hidden'] });
  });

  it('supports range syntax', () => {
    expect(classes('@media (width >= 768px) { .a { display: none } }')).toEqual({ '.a': ['md:hidden'] });
    expect(classes('@media (width < 640px) { .a { display: none } }')).toEqual({ '.a': ['max-sm:hidden'] });
  });

  it('maps preference and orientation features', () => {
    expect(classes('@media (prefers-color-scheme: dark) { .a { display: none } }')).toEqual({ '.a': ['dark:hidden'] });
    expect(classes('@media (prefers-reduced-motion: reduce) { .a { display: none } }')).toEqual({ '.a': ['motion-reduce:hidden'] });
    expect(classes('@media print { .a { display: none } }')).toEqual({ '.a': ['print:hidden'] });
    expect(classes('@media (orientation: portrait) { .a { display: none } }')).toEqual({ '.a': ['portrait:hidden'] });
  });

  it('falls back to an arbitrary media variant for unknown features', () => {
    expect(classes('@media (hover: hover) { .a { display: none } }')).toEqual({ '.a': ['[@media(hover:hover)]:hidden'] });
  });

  it('puts variants before the class prefix', () => {
    expect(classes('@media (min-width: 768px) { .a { display: none } }', 'tw-')).toEqual({ '.a': ['md:tw-hidden'] });
  });

  it('notes the variant on unrecognized declarations', () => {
    const [result] = convertCSS('@media (min-width: 768px) { .a { foo: bar } }', '');
    expect(result.unrecognized).toEqual(['foo: bar (md:)']);
  });
});

describe('convertCSS — other at-rules', () => {
  it('converts @supports to a supports-[] variant', () => {
    expect(classes('@supports (display: grid) { .a { display: grid } }')).toEqual({ '.a': ['supports-[display:grid]:grid'] });
  });

  it('treats @layer as transparent', () => {
    expect(classes('@layer components { .a { display: flex } }')).toEqual({ '.a': ['flex'] });
  });

  it('reports @keyframes as unrecognized instead of mangling it', () => {
    const results = convertCSS('@keyframes spin { from { opacity: 0 } to { opacity: 1 } } .a { display: flex }', '');
    expect(results[0].unrecognized).toEqual(['@keyframes spin { … }']);
    expect(results[1]).toMatchObject({ selector: '.a', entries: [{ cls: 'flex' }] });
  });
});

describe('convertCSS — pseudo-classes and nesting', () => {
  it('turns pseudo-classes into variants on the base selector', () => {
    const css = '.btn { display: flex } .btn:hover { display: block } .btn:focus-visible::after { display: none }';
    expect(classes(css)).toEqual({ '.btn': ['flex', 'hover:block', 'focus-visible:after:hidden'] });
  });

  it('combines media and pseudo variants', () => {
    expect(classes('@media (min-width: 768px) { .a:hover { display: none } }')).toEqual({ '.a': ['md:hover:hidden'] });
  });

  it('leaves unknown pseudo-classes in the selector', () => {
    expect(classes('.a:not(.b) { display: none }')).toEqual({ '.a:not(.b)': ['hidden'] });
  });

  it('resolves native nesting with &', () => {
    const css = '.a { display: flex; &:hover { display: block } @media (max-width: 640px) { display: none } }';
    expect(classes(css)).toEqual({ '.a': ['flex', 'hover:block', 'max-sm:hidden'] });
  });

  it('resolves nested descendant selectors', () => {
    expect(classes('.a { span { display: none } }')).toEqual({ '.a span': ['hidden'] });
  });
});

describe('convertCSS — Figma tokens', () => {
  it('keeps typography comments working', () => {
    const css = `.label {
  /* New/Paragraph/P1 Regular */
  font-family: "Open Sans";
  font-size: 0.75rem;
  line-height: 1.25rem; /* 166.667% */
}`;
    expect(classes(css)).toEqual({ '.label': ['paragraph-p1-regular'] });
  });

  it('does not treat braces inside strings as blocks', () => {
    expect(classes('.a { content: "{"; display: flex }')['.a']).toContain('flex');
  });
});
