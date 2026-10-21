import { test, expect } from '@playwright/test';
import { PDFDocument, PDFDict, PDFName, PDFNumber, PDFStream } from '@cantoo/pdf-lib';

test('places a typed signature and embeds it at print resolution', async ({ page }) => {
  await page.goto('/pdf/sign');
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  const pdfBuffer = Buffer.from(await doc.save());

  await expect(async () => {
    await page.setInputFiles('input[type="file"][accept*="pdf"]', { name: 'contract.pdf', mimeType: 'application/pdf', buffer: pdfBuffer });
    await expect(page.getByRole('tab', { name: 'Type' })).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });

  await page.getByRole('tab', { name: 'Type' }).click();
  await page.getByPlaceholder('Your name').fill('Test Signer');
  await page.getByRole('button', { name: /Place on Page 1/ }).click();

  // The signature layer must be displayed at the same size as the (CSS-scaled) page under it,
  // otherwise signatures appear in a different spot than where the export puts them
  const sizes = await page.evaluate(() => {
    const stage = document.querySelector('.konvajs-content')!;
    const pageCanvas = stage.closest('.relative')!.querySelector(':scope > canvas')!;
    return { stage: stage.clientWidth, page: pageCanvas.clientWidth };
  });
  expect(Math.abs(sizes.stage - sizes.page)).toBeLessThanOrEqual(1);
  await page.getByRole('button', { name: 'Export Signed PDF' }).click();
  await expect(page.getByText('Output (1 file)')).toBeVisible({ timeout: 30_000 });

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download' }).click();
  const chunks: Buffer[] = [];
  for await (const chunk of await (await download).createReadStream()) chunks.push(chunk as Buffer);
  const out = await PDFDocument.load(Buffer.concat(chunks));

  const xObjects = out.getPage(0).node.Resources()!.lookup(PDFName.of('XObject'), PDFDict);
  expect(xObjects.keys()).toHaveLength(1);
  const image = xObjects.lookup(xObjects.keys()[0], PDFStream);
  // Well above 1 px per point on a 595pt-wide page, so the signature stays crisp when zoomed/printed
  expect(image.dict.lookup(PDFName.of('Width'), PDFNumber).asNumber()).toBeGreaterThanOrEqual(595 * 3 - 1);
});
