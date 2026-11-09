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

const scores = [
  'name,score,joined',
  'Ann,10,2024-03-01',
  'Bob,9,2023-11-20',
  'Cy,,2024-01-15',
  'Dee,100,2022-07-04',
  'Eve,9,2024-02-02',
].join('\n');

test('sorts numerically with empties last and the header kept on top', async ({ page }) => {
  await page.goto('/csv/sort-filter');
  await upload(page, 'scores.csv', scores, () =>
    expect(page.getByRole('button', { name: 'Add sort' })).toBeVisible({ timeout: 3_000 }));

  await page.getByRole('button', { name: 'Add sort' }).click();
  await pick(page, 'Sort 1 column', 'score');
  await pick(page, 'Sort 1 direction', 'Descending');

  await page.getByRole('button', { name: 'Create sorted CSV' }).click();
  const { name, body } = await downloadText(page);
  expect(name).toBe('scores-sorted.csv');
  // Auto-detected as numbers (100 > 10 > 9), stable for the tied 9s, empty last
  expect(body).toBe([
    'name,score,joined',
    'Dee,100,2022-07-04',
    'Ann,10,2024-03-01',
    'Bob,9,2023-11-20',
    'Eve,9,2024-02-02',
    'Cy,,2024-01-15',
  ].join('\r\n'));
});

test('filters with AND / OR rules and reports the match count', async ({ page }) => {
  await page.goto('/csv/sort-filter');
  await upload(page, 'scores.csv', scores, () =>
    expect(page.getByRole('button', { name: 'Add filter' })).toBeVisible({ timeout: 3_000 }));

  await expect(page.getByText('5 of 5 rows match')).toBeVisible();

  await page.getByRole('button', { name: 'Add filter' }).click();
  await pick(page, 'Filter 1 column', 'joined');
  await pick(page, 'Filter 1 operator', '≥');
  await page.getByLabel('Filter 1 value').fill('2024-01-01');
  await expect(page.getByText('3 of 5 rows match')).toBeVisible();

  await page.getByRole('button', { name: 'Add filter' }).click();
  await pick(page, 'Filter 2 column', 'score');
  await pick(page, 'Filter 2 operator', 'is empty');
  await expect(page.getByLabel('Filter 2 value')).toHaveCount(0);
  await expect(page.getByText('1 of 5 rows match')).toBeVisible();

  await page.getByRole('button', { name: 'Match any (OR)' }).click();
  await expect(page.getByText('3 of 5 rows match')).toBeVisible();

  await pick(page, 'Filter 2 operator', 'contains');
  await page.getByLabel('Filter 2 value').fill('100');
  await expect(page.getByText('4 of 5 rows match')).toBeVisible();

  await page.getByRole('button', { name: 'Add sort' }).click();
  await pick(page, 'Sort 1 column', 'name');

  await page.getByRole('button', { name: 'Create sorted CSV' }).click();
  const { body } = await downloadText(page);
  expect(body).toBe([
    'name,score,joined',
    'Ann,10,2024-03-01',
    'Cy,,2024-01-15',
    'Dee,100,2022-07-04',
    'Eve,9,2024-02-02',
  ].join('\r\n'));
});
