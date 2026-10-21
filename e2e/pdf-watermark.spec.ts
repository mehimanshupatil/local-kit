import { test, expect } from '@playwright/test';
import { PDFDocument } from '@cantoo/pdf-lib';

async function buildBlankPdf(pageCount: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) doc.addPage([595, 842]);
  return Buffer.from(await doc.save());
}

test('shows a live watermark preview and applies it to every page', async ({ page }) => {
  await page.goto('/pdf/watermark');
  const pdfBuffer = await buildBlankPdf(2);
  const applyButton = page.getByRole('button', { name: 'Apply Watermark' });

  await expect(async () => {
    await page.setInputFiles('input[type="file"][accept*="pdf"]', { name: 'two-pages.pdf', mimeType: 'application/pdf', buffer: pdfBuffer });
    await expect(applyButton).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });

  const overlay = page.locator('canvas[aria-label="Watermark preview"]');
  // Count painted pixels on the overlay canvas — the watermark is the only thing drawn there
  const paintedPixels = () => overlay.evaluate((c: HTMLCanvasElement) => {
    const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) n++;
    return n;
  });

  await page.getByPlaceholder('e.g. CONFIDENTIAL').fill('DRAFT');
  await expect.poll(paintedPixels).toBeGreaterThan(500);

  await page.getByPlaceholder('e.g. CONFIDENTIAL').fill('');
  await expect.poll(paintedPixels).toBe(0);

  await page.getByPlaceholder('e.g. CONFIDENTIAL').fill('DRAFT');
  await expect.poll(paintedPixels).toBeGreaterThan(500);
  const single = await paintedPixels();

  // Repeat tiles the page, so far more of the overlay is painted than with one copy
  await page.getByRole('checkbox', { name: 'Repeat across page' }).click();
  await expect(page.getByText('Spacing')).toBeVisible();
  await expect.poll(paintedPixels).toBeGreaterThan(single * 4);

  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByText('Page 2 / 2')).toBeVisible();
  await expect.poll(paintedPixels).toBeGreaterThan(500);

  await applyButton.click();
  await expect(page.getByText('Output (1 file)')).toBeVisible({ timeout: 30_000 });

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download' }).click();
  const out = await PDFDocument.load(await (await download).createReadStream().then(async (s) => {
    const chunks: Buffer[] = [];
    for await (const chunk of s) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  }));
  expect(out.getPageCount()).toBe(2);
});
