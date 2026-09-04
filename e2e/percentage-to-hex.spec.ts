import { test, expect } from '@playwright/test';

// The inputs live inside the PercentageToHexTool React island (client:load).
// Filling before hydration attaches the onChange listener is a silent no-op
// (same class of race as e2e/word-to-pdf.spec.ts's file input), so retry the
// fill until a sibling field visibly reflects the derived value.
async function fillAndWaitFor(
  input: import('@playwright/test').Locator,
  sibling: import('@playwright/test').Locator,
  value: string,
  marker: RegExp,
) {
  await expect(async () => {
    await input.fill(value);
    await expect(sibling).toHaveValue(marker, { timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
}

test('converts percent to hex and decimal, matching the worked example', async ({ page }) => {
  await page.goto('/dev/percentage-to-hex');

  const percent = page.getByLabel('Percent (0–100)');
  const hex = page.getByLabel('Hex (00–FF)');
  const decimal = page.getByLabel('Decimal (0–255)');

  await fillAndWaitFor(percent, hex, '35', /^59$/);
  await expect(decimal).toHaveValue('89');
});

test('converts hex back to percent and decimal', async ({ page }) => {
  await page.goto('/dev/percentage-to-hex');

  const percent = page.getByLabel('Percent (0–100)');
  const hex = page.getByLabel('Hex (00–FF)');
  const decimal = page.getByLabel('Decimal (0–255)');

  await fillAndWaitFor(hex, percent, '59', /^35$/);
  await expect(decimal).toHaveValue('89');
});

test('clamps an out-of-range percent instead of rejecting it', async ({ page }) => {
  await page.goto('/dev/percentage-to-hex');

  const percent = page.getByLabel('Percent (0–100)');
  const hex = page.getByLabel('Hex (00–FF)');
  const decimal = page.getByLabel('Decimal (0–255)');

  await fillAndWaitFor(percent, hex, '150', /^FF$/);
  await expect(decimal).toHaveValue('255');
  await expect(percent).toHaveValue('150');
});

test('ignores non-numeric input instead of erroring', async ({ page }) => {
  await page.goto('/dev/percentage-to-hex');

  const percent = page.getByLabel('Percent (0–100)');
  const hex = page.getByLabel('Hex (00–FF)');

  await fillAndWaitFor(percent, hex, '35', /^59$/);
  await percent.fill('abc');
  await expect(percent).toHaveValue('abc');
  // hex/decimal are frozen at the last valid conversion, not reset or errored
  await expect(hex).toHaveValue('59');
});
