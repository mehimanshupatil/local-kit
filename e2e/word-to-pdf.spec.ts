import { test, expect } from '@playwright/test';
import { PDFDocument } from '@cantoo/pdf-lib';
import { buildLongDocx } from './fixtures/buildLongDocx';

// Full-flow smoke test for the Word → PDF tool. Regression coverage for the
// underlying chunking/scaling math lives in src/lib/pdf/wordToPdf.test.ts
// (dd3de90); this test exercises the real upload → convert → download path.
test('converts a long .docx into a multi-page PDF', async ({ page }) => {
  const docxBuffer = await buildLongDocx(300);

  await page.goto('/pdf/word-to-pdf');

  const convertButton = page.getByRole('button', { name: 'Convert to PDF' });

  // The dropzone's file input exists in the SSR markup before the React
  // island hydrates; setting it before the hydrated listener attaches is a
  // silent no-op. Rather than guess a fixed delay (flaky under CI's slower,
  // colder dev-server startup), retry the upload until it visibly took.
  await expect(async () => {
    await page.setInputFiles('input[type="file"]', {
      name: 'long-document.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: docxBuffer,
    });
    await expect(convertButton).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });

  await convertButton.click();

  await expect(page.getByText('Output (1 file)')).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: 'Preview PDF' }).click();
  const previewFrame = page.locator('iframe[title="PDF preview"]');
  await expect(previewFrame).toBeVisible();

  const pdfUrl = await previewFrame.getAttribute('src');
  expect(pdfUrl).toBeTruthy();

  const base64 = await page.evaluate(async (url) => {
    const buf = await (await fetch(url as string)).arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }, pdfUrl);

  const pdfBytes = Buffer.from(base64, 'base64');
  const pdfDoc = await PDFDocument.load(pdfBytes);

  // Smoke-level check that the full pipeline produced a plausible multi-page
  // PDF. This does not itself detect a blank/blurry render (see the pure
  // chunking/scaling unit tests for that) — it catches wholesale breakage:
  // thrown errors, zero pages, or a suspiciously tiny/corrupt file.
  expect(pdfDoc.getPageCount()).toBeGreaterThan(1);
  expect(pdfBytes.byteLength).toBeGreaterThan(10_000);
});
