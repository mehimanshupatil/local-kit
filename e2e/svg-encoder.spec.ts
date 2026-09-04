import { test, expect } from '@playwright/test';

// The textarea lives inside the SvgEncoderTool React island (client:load).
// Filling it before hydration attaches the onChange listener is a silent
// no-op (same class of race as e2e/word-to-pdf.spec.ts's file input), so
// retry the fill until the output box visibly reflects it.
async function fillAndWaitForOutput(
  input: import('@playwright/test').Locator,
  output: import('@playwright/test').Locator,
  svg: string,
  marker: RegExp,
) {
  await expect(async () => {
    await input.fill(svg);
    await expect(output).toHaveValue(marker, { timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
}

test('encodes pasted SVG markup to a data URI and previews it', async ({ page }) => {
  await page.goto('/dev/svg-encoder');

  const input = page.getByPlaceholder('Paste <svg>…</svg> markup here…');
  const output = page.getByPlaceholder('Encoded data URI will appear here…');

  await fillAndWaitForOutput(
    input,
    output,
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
    /rect/,
  );

  const urlValue = await output.inputValue();
  expect(urlValue.startsWith('data:image/svg+xml,')).toBe(true);
  expect(urlValue).not.toContain('"');

  const preview = page.getByAltText('SVG preview');
  await expect(preview).toBeVisible();
  await expect(preview).toHaveJSProperty('naturalWidth', 10);

  await page.getByRole('tab', { name: 'Base64' }).click();
  await expect(output).toHaveValue(/^data:image\/svg\+xml;base64,/);
  await expect(preview).toHaveJSProperty('naturalWidth', 10);
});

test('renders markup missing xmlns and containing an inline <style> block', async ({ page }) => {
  await page.goto('/dev/svg-encoder');

  const input = page.getByPlaceholder('Paste <svg>…</svg> markup here…');
  const output = page.getByPlaceholder('Encoded data URI will appear here…');

  // Real-world exported SVGs frequently: (a) omit xmlns when copied as an
  // inline fragment, and (b) embed a <style> block with curly braces —
  // both previously produced a broken (non-rendering) preview image.
  await fillAndWaitForOutput(
    input,
    output,
    '<svg width="10" height="10" viewBox="0 0 10 10"><style>.a{fill:#0f0}</style><rect class="a" width="10" height="10"/></svg>',
    /rect/,
  );

  const urlValue = await output.inputValue();
  expect(urlValue).toContain('xmlns');
  expect(urlValue).not.toMatch(/[{}]/);

  const preview = page.getByAltText('SVG preview');
  await expect(preview).toBeVisible();
  await expect(preview).toHaveJSProperty('naturalWidth', 10);
});

test('warns on text that has no <svg> tag', async ({ page }) => {
  await page.goto('/dev/svg-encoder');

  const input = page.getByPlaceholder('Paste <svg>…</svg> markup here…');
  const output = page.getByPlaceholder('Encoded data URI will appear here…');

  await fillAndWaitForOutput(input, output, 'not svg at all', /not svg at all/);

  await expect(page.getByText("This doesn't look like SVG markup")).toBeVisible();
});

test('loads a dropped .svg file into the markup textarea', async ({ page }) => {
  await page.goto('/dev/svg-encoder');

  const input = page.getByPlaceholder('Paste <svg>…</svg> markup here…');
  const output = page.getByPlaceholder('Encoded data URI will appear here…');

  await expect(async () => {
    await page.setInputFiles('input[type="file"]', {
      name: 'icon.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle r="5"/></svg>'),
    });
    await expect(input).toHaveValue(/circle/, { timeout: 3_000 });
  }).toPass({ timeout: 30_000 });

  await expect(output).toHaveValue(/circle/);
});
