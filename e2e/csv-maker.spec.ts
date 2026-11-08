import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';

const cell = (page: Page, ref: string) => page.getByLabel(`Cell ${ref}`, { exact: true });

// The grid is a React island (client:load); typing before hydration attaches
// onChange is a silent no-op, so retry until the preview reflects the edit.
async function fillWhenHydrated(page: Page, ref: string, value: string) {
  const preview = page.locator('#csv-output');
  await expect(async () => {
    await cell(page, ref).fill(value);
    await expect(preview).toHaveValue(new RegExp(value), { timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
}

async function pasteInto(page: Page, ref: string, text: string) {
  await cell(page, ref).evaluate((el, t) => {
    const data = new DataTransfer();
    data.setData('text/plain', t);
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, text);
}

test('builds a CSV from typed cells and downloads it', async ({ page }) => {
  await page.goto('/csv/maker');

  await fillWhenHydrated(page, 'A1', 'name');
  await cell(page, 'B1').fill('note');
  await cell(page, 'A2').fill('Ann');
  await cell(page, 'B2').fill('likes "tea", mostly');

  // Empty trailing rows/columns of the starting 5×4 grid are trimmed. A
  // textarea's .value normalises CRLF to LF, so the real line endings are
  // asserted on the downloaded bytes below.
  await expect(page.locator('#csv-output')).toHaveValue('name,note\nAnn,"likes ""tea"", mostly"');
  await expect(page.getByText('CSV preview · 2 rows × 2 columns')).toBeVisible();

  await page.getByLabel('File name').fill('people');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV' }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe('people.csv');
  const body = await readFile((await download.path())!, 'utf-8');
  expect(body).toBe('name,note\r\nAnn,"likes ""tea"", mostly"');
});

test('pasting a range from a spreadsheet fills and grows the grid', async ({ page }) => {
  await page.goto('/csv/maker');
  await fillWhenHydrated(page, 'A1', 'x');

  // 3 columns × 7 rows pasted at B1 — wider and taller than the 5×4 starting grid
  const rows = Array.from({ length: 7 }, (_, i) => `r${i}a\tr${i}b\tr${i}c`).join('\r\n') + '\r\n';
  await pasteInto(page, 'B1', rows);

  await expect(cell(page, 'D7')).toHaveValue('r6c');
  await expect(cell(page, 'B1')).toHaveValue('r0a');
  await expect(cell(page, 'A1')).toHaveValue('x');
  await expect(page.getByText('CSV preview · 7 rows × 4 columns')).toBeVisible();
});

test('imports a semicolon CSV, detects the delimiter and re-exports with commas', async ({ page }) => {
  await page.goto('/csv/maker');
  await fillWhenHydrated(page, 'A1', 'placeholder');

  await page.getByRole('button', { name: 'Import CSV' }).click();
  await page.setInputFiles('input[type="file"]', {
    name: 'prices.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('\uFEFFitem;price\nbread;2,50\n'),
  });

  await expect(cell(page, 'A1')).toHaveValue('item');
  await expect(cell(page, 'B2')).toHaveValue('2,50');
  await expect(page.getByLabel('File name')).toHaveValue('prices');
  await expect(page.locator('#csv-output')).toHaveValue('item;price\nbread;2,50');

  await page.getByRole('combobox').filter({ hasText: 'Semicolon' }).click();
  await page.getByRole('option', { name: 'Comma (,)' }).click();
  await expect(page.locator('#csv-output')).toHaveValue('item,price\nbread,"2,50"');
});

test('reports an empty import file instead of wiping the grid', async ({ page }) => {
  await page.goto('/csv/maker');
  await fillWhenHydrated(page, 'A1', 'keep me');

  await page.getByRole('button', { name: 'Import CSV' }).click();
  await page.setInputFiles('input[type="file"]', { name: 'empty.csv', mimeType: 'text/csv', buffer: Buffer.from('') });

  await expect(page.getByText('That file is empty.')).toBeVisible();
  await expect(cell(page, 'A1')).toHaveValue('keep me');
});

test('row and column controls reorder and delete', async ({ page }) => {
  await page.goto('/csv/maker');
  await fillWhenHydrated(page, 'A1', 'a1');
  await cell(page, 'B1').fill('b1');
  await cell(page, 'A2').fill('a2');

  await page.getByRole('button', { name: 'Move row 2 up' }).click();
  await expect(cell(page, 'A1')).toHaveValue('a2');

  await page.getByRole('button', { name: 'Move column A right' }).click();
  await expect(cell(page, 'B1')).toHaveValue('a2');

  await page.getByRole('button', { name: 'Delete row 1' }).click();
  await expect(page.locator('#csv-output')).toHaveValue('b1,a1');
});
