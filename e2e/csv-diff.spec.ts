import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';

const ORIGINAL = 'id,name,city\n1,Ann,Paris\n2,Bob,Oslo\n3,Cy,Rome\n';
// Semicolon-delimited, reordered, with a changed city, an added row, a removed row and an extra column
const CHANGED = 'ID;city;name;zip\n3;Milan;Cy;20100\n1;Paris;Ann;75001\n4;Lima;Di;15001\n';

const fileInput = (page: Page, side: 'Original' | 'Changed') =>
  page.getByRole('region', { name: `${side} file` }).locator('input[type="file"]');

// The dropzone's input exists before hydration; retry the upload until the island reacts.
async function upload(page: Page, side: 'Original' | 'Changed', name: string, text: string) {
  await expect(async () => {
    const loaded = page.getByRole('button', { name: `Remove ${side.toLowerCase()} file` });
    if (!(await loaded.isVisible())) {
      await fileInput(page, side).setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(text) });
    }
    await expect(loaded).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
}

async function loadBoth(page: Page) {
  await page.goto('/csv/diff');
  await upload(page, 'Original', 'before.csv', ORIGINAL);
  await upload(page, 'Changed', 'after.csv', CHANGED);
  await expect(page.getByRole('table', { name: 'Differences' })).toBeVisible();
}

test('matches rows by key column and summarises the differences', async ({ page }) => {
  await loadBoth(page);

  await expect(page.getByRole('combobox', { name: 'Match rows by' })).toHaveText(/^id/);
  // added, removed, changed, unchanged
  await expect(page.getByLabel('Summary').locator('dd')).toHaveText(['1', '1', '1', '1']);
  await expect(page.getByText('Only in Changed: zip')).toBeVisible();

  const table = page.getByRole('table', { name: 'Differences' });
  await expect(table.getByRole('cell', { name: 'Rome → Milan' })).toBeVisible();
  await expect(table.getByRole('row')).toHaveCount(5);

  await page.getByRole('tab', { name: 'Added' }).click();
  await expect(table.getByRole('row')).toHaveCount(2);
  await expect(table.getByRole('cell', { name: 'Di' })).toBeVisible();

  await page.getByRole('tab', { name: 'Removed' }).click();
  await expect(table.getByRole('cell', { name: 'Bob' })).toBeVisible();
  await expect(table.getByRole('row')).toHaveCount(2);
});

test('exports diff-report.csv with old → new for changed cells', async ({ page }) => {
  await loadBoth(page);

  await page.getByRole('button', { name: 'Export diff report' }).click();
  await expect(page.getByText('Output (1 file)')).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('diff-report.csv');
  // Delimiter defaults to the Original file's (comma)
  expect(await readFile((await download.path())!, 'utf-8')).toBe([
    'status,id,name,city,zip',
    'removed,2,Bob,Oslo,',
    'changed,3,Cy,Rome → Milan,20100',
    'unchanged,1,Ann,Paris,75001',
    'added,4,Di,Lima,15001',
  ].join('\r\n'));
});

test('compares by row position when chosen', async ({ page }) => {
  await loadBoth(page);

  await page.getByRole('combobox', { name: 'Match rows by' }).click();
  await page.getByRole('option', { name: 'Row position' }).click();
  // Rows 1 and 2 differ; row 3 differs; nothing added or removed
  await expect(page.getByLabel('Summary').locator('dd')).toHaveText(['0', '0', '3', '0']);
});

test('warns about duplicate keys', async ({ page }) => {
  await page.goto('/csv/diff');
  await upload(page, 'Original', 'a.csv', 'id,v\n1,a\n1,b\n');
  await upload(page, 'Changed', 'b.csv', 'id,v\n1,a\n');
  await expect(page.getByText('Duplicate keys in Original (“1”) — only the first occurrence of each is matched.')).toBeVisible();
  await expect(page.getByLabel('Summary').locator('dd')).toHaveText(['0', '1', '0', '1']);
});
