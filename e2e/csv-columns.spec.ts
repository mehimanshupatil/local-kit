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

async function pick(page: Page, combobox: string, option: string) {
  await page.getByRole('combobox', { name: combobox }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

const people = 'first,last,city,zip\nAnn,Lee,Paris,75001\nBob,Ray,Rome,00100\n';

test('removes, renames, reorders and joins columns', async ({ page }) => {
  await page.goto('/csv/columns');
  await upload(page, 'people.csv', people, () =>
    expect(page.getByRole('button', { name: 'Create CSV' })).toBeVisible({ timeout: 3_000 }));

  await page.getByRole('checkbox', { name: 'Keep zip' }).click();
  await page.getByLabel('Name for city').fill('Town');
  await page.getByRole('button', { name: 'Move city up' }).click();
  await expect(page.getByRole('columnheader')).toHaveText(['first', 'Town', 'last']);

  // Join first + last (default picks the first two preview columns: first, Town)
  await pick(page, 'Join column 2', 'last');
  await page.getByLabel('New column name').fill('Full name');
  await page.getByRole('button', { name: 'Join columns' }).click();
  await expect(page.getByRole('columnheader')).toHaveText(['Full name', 'Town']);

  await page.getByRole('button', { name: 'Create CSV' }).click();
  await expect(page.getByText('Output (1 file)')).toBeVisible();
  const { name, body } = await downloadText(page);
  expect(name).toBe('people-columns.csv');
  expect(body).toBe('Full name,Town\r\nAnn Lee,Paris\r\nBob Ray,Rome');
});

test('splits a column into numbered parts sized to the longest value', async ({ page }) => {
  await page.goto('/csv/columns');
  await upload(page, 'dates.tsv', 'id\tdate\n1\t2024-01-05\n2\t2023-12\n', () =>
    expect(page.getByRole('button', { name: 'Create CSV' })).toBeVisible({ timeout: 3_000 }));

  await pick(page, 'Column to split', 'date');
  await page.getByLabel('Split on').fill('-');
  await page.getByRole('button', { name: 'Split column' }).click();
  await expect(page.getByLabel('Name for date 3')).toHaveValue('date 3');

  await page.getByRole('button', { name: 'Create CSV' }).click();
  const { name, body } = await downloadText(page);
  expect(name).toBe('dates-columns.csv');
  // Tab input → tab output by default
  expect(body).toBe('id\tdate 1\tdate 2\tdate 3\r\n1\t2024\t01\t05\r\n2\t2023\t12\t');
});
