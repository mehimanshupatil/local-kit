import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';

// The dropzone's input exists before hydration; retry the upload until the island reacts.
async function upload(page: Page, name: string, text: string, until: () => Promise<void>) {
  await expect(async () => {
    // The dropzone unmounts once a file loads; a slow first attempt must not be retried against a missing input
    if (await page.locator('input[type="file"]').count()) {
      await page.setInputFiles('input[type="file"]', { name, mimeType: 'text/csv', buffer: Buffer.from(text) });
    }
    await until();
  }).toPass({ timeout: 30_000 });
}

const PEOPLE = 'name;city\nAnn;Paris\nBob;Oslo\nCy;Paris\nDi;\nEd;São Paulo / SP\n';

test('splits every N rows with the header repeated, keeping the detected delimiter', async ({ page }) => {
  await page.goto('/csv/split');
  await upload(page, 'people.csv', PEOPLE, () =>
    expect(page.getByLabel('Rows per file')).toBeVisible({ timeout: 3_000 }));

  await page.getByLabel('Rows per file').fill('2');
  await expect(page.getByText('Will produce 3 files.')).toBeVisible();

  await page.getByRole('button', { name: 'Split into 3 files' }).click();
  await expect(page.getByText('Output (3 files)')).toBeVisible();
  for (const n of ['001', '002', '003']) await expect(page.getByText(`people-part-${n}.csv`)).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).nth(1).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('people-part-002.csv');
  const body = await readFile((await download.path())!, 'utf-8');
  expect(body).toBe('name;city\r\nCy;Paris\r\nDi;');
});

test('splits by column value with filename-safe names and blanks grouped as "empty"', async ({ page }) => {
  await page.goto('/csv/split');
  await upload(page, 'people.csv', PEOPLE, () =>
    expect(page.getByRole('tab', { name: 'By column value' })).toBeVisible({ timeout: 3_000 }));

  await page.getByRole('tab', { name: 'By column value' }).click();
  await page.getByRole('combobox', { name: 'Column', exact: true }).click();
  await page.getByRole('option', { name: 'city' }).click();
  await expect(page.getByText('Will produce 4 files.')).toBeVisible();

  await page.getByRole('button', { name: 'Split into 4 files' }).click();
  await expect(page.getByText('Output (4 files)')).toBeVisible();
  for (const name of ['people-Paris.csv', 'people-Oslo.csv', 'people-empty.csv', 'people-São-Paulo-SP.csv']) {
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  }

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).first().click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('people-Paris.csv');
  expect(await readFile((await download.path())!, 'utf-8')).toBe('name;city\r\nAnn;Paris\r\nCy;Paris');
});

test('refuses to create more than 1,000 files', async ({ page }) => {
  const ids = Array.from({ length: 1001 }, (_, i) => `id${i}`).join('\n');
  await page.goto('/csv/split');
  await upload(page, 'ids.csv', `id\n${ids}\n`, () =>
    expect(page.getByRole('tab', { name: 'By column value' })).toBeVisible({ timeout: 3_000 }));

  await page.getByRole('tab', { name: 'By column value' }).click();
  await expect(page.getByText('This would create 1,001 files — the limit is 1,000.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Split CSV' })).toBeDisabled();
});

test('shows an error for an empty file', async ({ page }) => {
  await page.goto('/csv/split');
  await upload(page, 'empty.csv', '', () =>
    expect(page.getByText('That file is empty.')).toBeVisible({ timeout: 3_000 }));
});
