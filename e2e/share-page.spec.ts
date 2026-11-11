import { test, expect, type Page } from '@playwright/test';

const shareDialog = (page: Page) => page.getByRole('dialog', { name: 'Share this page' });

// The island's button exists before hydration; retry the click until the dialog opens
async function openShare(page: Page) {
  await expect(async () => {
    await page.getByRole('button', { name: 'Share this page' }).filter({ visible: true }).click();
    await expect(shareDialog(page)).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

test('shares a tool page with its query, by QR code and copied link', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => { delete (Navigator.prototype as Partial<Navigator>).share; });
  await page.goto('/dev/epoch-converter?t=1700000000');
  await openShare(page);

  const dialog = shareDialog(page);
  const expected = new URL('/dev/epoch-converter?t=1700000000', page.url()).toString();
  await expect(dialog.getByRole('textbox', { name: 'Page link' })).toHaveValue(expected);
  await expect(dialog.getByRole('img', { name: 'QR code for this page' })).toHaveAttribute('src', /^data:image\/png;base64,/);
  // No system share sheet in this browser, so no button for it
  await expect(dialog.getByRole('button', { name: 'Share…' })).toHaveCount(0);

  await dialog.getByRole('button', { name: 'Copy' }).click();
  await expect(dialog.getByRole('button', { name: 'Copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(expected);
});

test('uses the system share sheet where there is one', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __shared: ShareData[] }).__shared = [];
    navigator.share = async data => { (window as unknown as { __shared: ShareData[] }).__shared.push(data!); };
  });
  await page.goto('/pdf/merge');
  await openShare(page);
  await shareDialog(page).getByRole('button', { name: 'Share…' }).click();

  await expect(shareDialog(page)).toBeHidden();
  const shared = await page.evaluate(() => (window as unknown as { __shared: ShareData[] }).__shared);
  expect(shared).toEqual([{ title: await page.title(), url: new URL('/pdf/merge', page.url()).toString() }]);
});

test('never shares the part after #, which can hold a pairing secret', async ({ page }) => {
  await page.goto('/faq#pair=AbCdEfGhIjKlMnOpQrStUv');
  await openShare(page);
  await expect(shareDialog(page).getByRole('textbox', { name: 'Page link' })).toHaveValue(new URL('/faq', page.url()).toString());
});

test('is in the top bar on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 400, height: 800 });
  await page.goto('/');
  await openShare(page);
  await expect(shareDialog(page).getByRole('textbox', { name: 'Page link' })).toHaveValue(new URL('/', page.url()).toString());
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
