import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';

// The dropzone's input exists before hydration; retry the upload until the island reacts.
async function upload(page: Page, name: string, text: string, until: () => Promise<void>) {
  await expect(async () => {
    await page.setInputFiles('input[type="file"]', { name, mimeType: 'text/csv', buffer: Buffer.from(text) });
    await until();
  }).toPass({ timeout: 30_000 });
}

async function downloadText(page: Page) {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  const download = await downloadPromise;
  return { name: download.suggestedFilename(), body: await readFile((await download.path())!, 'utf-8') };
}

const NBSP = '\u00A0';
const ZWSP = '\u200B';

const messy = [
  ' name ;city;',
  `Ann${ZWSP};New${NBSP}${NBSP}York;`,
  ';;',
  'bob  lee; paris ;',
  'Bob Lee;Paris;',
  'ann;new york;',
].join('\n');

test('cleans whitespace, empty rows/columns and duplicates, keeping the input delimiter', async ({ page }) => {
  await page.goto('/csv/cleaner');
  await upload(page, 'people.csv', messy, () =>
    expect(page.getByRole('button', { name: 'Create cleaned CSV' })).toBeVisible({ timeout: 3_000 }));

  // Defaults: trim, collapse, invisible, empty rows/cols, case-sensitive dedupe
  await expect(page.getByText('5 cells changed · 1 row removed · 1 column removed')).toBeVisible();

  await page.getByRole('checkbox', { name: 'Ignore case when comparing' }).click();
  await expect(page.getByText('5 cells changed · 3 rows removed · 1 column removed')).toBeVisible();

  await page.getByRole('combobox', { name: 'Text case' }).click();
  await page.getByRole('option', { name: 'Title Case' }).click();

  await page.getByRole('button', { name: 'Create cleaned CSV' }).click();
  await expect(page.getByText('Output (1 file)')).toBeVisible();

  const { name, body } = await downloadText(page);
  expect(name).toBe('people-clean.csv');
  expect(body).toBe(['name;city', 'Ann;New York', 'Bob Lee;Paris'].join('\r\n'));
});

test('keeps the header row out of dedupe and case changes', async ({ page }) => {
  await page.goto('/csv/cleaner');
  await upload(page, 'dup.csv', 'Code,Code\nCode,Code\nx,y\n', () =>
    expect(page.getByRole('button', { name: 'Create cleaned CSV' })).toBeVisible({ timeout: 3_000 }));

  await page.getByRole('combobox', { name: 'Text case' }).click();
  await page.getByRole('option', { name: 'UPPERCASE' }).click();

  await page.getByRole('button', { name: 'Create cleaned CSV' }).click();
  const { body } = await downloadText(page);
  expect(body).toBe('Code,Code\r\nCODE,CODE\r\nX,Y');
});

test('shows an error for an empty file', async ({ page }) => {
  await page.goto('/csv/cleaner');
  await upload(page, 'empty.csv', '', () =>
    expect(page.getByText('That file is empty.')).toBeVisible({ timeout: 3_000 }));
});
