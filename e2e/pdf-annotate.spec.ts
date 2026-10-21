import { test, expect, type Page } from '@playwright/test';
import { PDFDocument, PDFDict, PDFName, PDFNumber, PDFStream } from '@cantoo/pdf-lib';

async function buildBlankPdf(pageCount: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) doc.addPage([595, 842]);
  return Buffer.from(await doc.save());
}

/** Number of image XObjects on a page — each embedded annotation layer adds one */
function imageCount(doc: PDFDocument, pageIndex: number): number {
  const resources = doc.getPage(pageIndex).node.Resources();
  const xObjects = resources?.lookupMaybe(PDFName.of('XObject'), PDFDict);
  return xObjects?.keys().length ?? 0;
}

/** Pixel width of the first image XObject on a page (the embedded annotation layer) */
function annotationImageWidth(doc: PDFDocument, pageIndex: number): number {
  const xObjects = doc.getPage(pageIndex).node.Resources()!.lookup(PDFName.of('XObject'), PDFDict);
  const image = xObjects.lookup(xObjects.keys()[0], PDFStream);
  return image.dict.lookup(PDFName.of('Width'), PDFNumber).asNumber();
}

async function scribble(page: Page) {
  const box = await page.locator('.konvajs-content').boundingBox();
  if (!box) throw new Error('Annotation stage not rendered');
  await page.mouse.move(box.x + 60, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 160, box.y + 120, { steps: 5 });
  await page.mouse.up();
}

// Regression: navigating between pages used to discard drawings, so only the
// last page's marks reached the saved PDF.
test('keeps annotations from every page in the saved PDF', async ({ page }) => {
  await page.goto('/pdf/annotate');

  const saveButton = page.getByRole('button', { name: /Save Annotated PDF/ });
  const pdfBuffer = await buildBlankPdf(3);

  // Retry until the hydrated dropzone accepts the file (see word-to-pdf.spec.ts)
  await expect(async () => {
    // The tool also has a hidden image picker input, so target the PDF dropzone's input
    await page.setInputFiles('input[type="file"][accept*="pdf"]', { name: 'three-pages.pdf', mimeType: 'application/pdf', buffer: pdfBuffer });
    await expect(page.getByText('Page 1 / 3')).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });

  await scribble(page);
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByText('Page 2 / 3')).toBeVisible();
  await scribble(page);
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByText('Page 3 / 3 · 2 annotated')).toBeVisible();

  await expect(saveButton).toHaveText(/\(2 pages\)/);
  await saveButton.click();
  await expect(page.getByText('Output (1 file)')).toBeVisible({ timeout: 30_000 });

  // The file bar has its own icon-only "Preview PDF" button for the source file; use the output's labelled one
  await page.getByText('Preview PDF', { exact: true }).click();
  const pdfUrl = await page.locator('iframe[title="PDF preview"]').getAttribute('src');
  expect(pdfUrl).toBeTruthy();

  const base64 = await page.evaluate(async (url) => {
    const bytes = new Uint8Array(await (await fetch(url as string)).arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  }, pdfUrl);

  const out = await PDFDocument.load(Buffer.from(base64, 'base64'));
  expect(out.getPageCount()).toBe(3);
  expect(imageCount(out, 0)).toBe(1);
  expect(imageCount(out, 1)).toBe(1);
  expect(imageCount(out, 2)).toBe(0);
  // Rasterised well above 1 px per point (595pt wide page) so marks stay crisp when zoomed/printed
  expect(annotationImageWidth(out, 0)).toBeGreaterThanOrEqual(595 * 3 - 1);
});

// Regression: text placement fired on mousedown and the browser's focus handling
// immediately blurred (and discarded) the new textarea; Image required an extra
// click on the page and dropped the image off-screen.
test('places text and an image, selects them, and saves', async ({ page }) => {
  await page.goto('/pdf/annotate');
  const tool = (name: string) => page.locator('astro-slot').getByRole('button', { name, exact: true });
  const deleteButton = page.getByRole('button', { name: 'Delete' });
  const pdfBuffer = await buildBlankPdf(1);

  await expect(async () => {
    await page.setInputFiles('input[type="file"][accept*="pdf"]', { name: 'one-page.pdf', mimeType: 'application/pdf', buffer: pdfBuffer });
    await expect(tool('Text')).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });

  const box = await page.locator('.konvajs-content').boundingBox();
  if (!box) throw new Error('Annotation stage not rendered');

  await tool('Text').click();
  await page.mouse.click(box.x + 100, box.y + 100);
  const textarea = page.getByPlaceholder('Type here, Enter to place…');
  await expect(textarea).toBeFocused();
  await textarea.fill('Hello');
  await textarea.press('Enter');
  await expect(textarea).toBeHidden();

  // Image is an action: the button itself opens the picker, and the new image comes in selected
  const pngBase64 = await page.evaluate(() => {
    const canvas = Object.assign(document.createElement('canvas'), { width: 80, height: 80 });
    canvas.getContext('2d')!.fillRect(0, 0, 80, 80);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const chooserPromise = page.waitForEvent('filechooser');
  await tool('Image').click();
  await (await chooserPromise).setFiles({ name: 'square.png', mimeType: 'image/png', buffer: Buffer.from(pngBase64, 'base64') });
  await expect(deleteButton).toBeVisible();

  // Selecting the text by clicking it
  await page.keyboard.press('Escape');
  await expect(deleteButton).toBeHidden();
  await page.mouse.click(box.x + 110, box.y + 108);
  await expect(deleteButton).toBeVisible();

  await page.getByRole('button', { name: /Save Annotated PDF/ }).click();
  await expect(page.getByText('Output (1 file)')).toBeVisible({ timeout: 30_000 });
});

// Regression: on narrow screens the page rendered at its full ~900px width and was cut off.
// It now shrinks to fit, with the drawing layer scaled to match so marks land where drawn.
test('fits the page on a phone-width screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/pdf/annotate');
  const pdfBuffer = await buildBlankPdf(1);

  await expect(async () => {
    await page.setInputFiles('input[type="file"][accept*="pdf"]', { name: 'one-page.pdf', mimeType: 'application/pdf', buffer: pdfBuffer });
    await expect(page.locator('.konvajs-content')).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });

  const sizes = await page.evaluate(() => {
    const stage = document.querySelector('.konvajs-content')!;
    const pageCanvas = stage.closest('.relative')!.querySelector(':scope > canvas')!;
    return { stage: stage.clientWidth, page: pageCanvas.clientWidth, overflow: document.documentElement.scrollWidth > innerWidth };
  });
  expect(sizes.overflow).toBe(false);
  expect(sizes.page).toBeLessThanOrEqual(390);
  expect(Math.abs(sizes.stage - sizes.page)).toBeLessThanOrEqual(1);
});
