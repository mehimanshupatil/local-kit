import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';

type Upload = { name: string; text: string };
const toFile = ({ name, text }: Upload) => ({ name, mimeType: 'text/csv', buffer: Buffer.from(text) });

// The dropzone's input exists before hydration; retry the upload until the island reacts.
async function uploadWhenHydrated(page: Page, files: Upload[]) {
  const list = page.getByRole('list', { name: 'Files to merge' });
  await expect(async () => {
    // A slow first attempt may still land; re-uploading would add the files twice
    if (!(await list.isVisible())) await page.setInputFiles('input[type="file"]', files.map(toFile));
    await expect(list).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
}

const A = { name: 'jan.csv', text: 'id,name\n1,Ann\n2,Bob\n' };
// Different delimiter, different column order, an extra column and one duplicate row
const B = { name: 'feb.csv', text: 'Name;ID;email\nCy;3;cy@example.com\nBob;2;\n' };

test('merges files by header name with mixed delimiters, a source column and de-duplication', async ({ page }) => {
  await page.goto('/csv/merge');
  await uploadWhenHydrated(page, [A, B]);

  const list = page.getByRole('list', { name: 'Files to merge' });
  await expect(list.getByRole('listitem')).toHaveCount(2);
  await expect(list.getByRole('listitem').first()).toContainText('2 rows · 2 columns');
  await expect(list.getByRole('listitem').nth(1)).toContainText('2 rows · 3 columns');
  await expect(page.getByText('Result: 4 rows × 3 columns')).toBeVisible();

  await page.getByRole('checkbox', { name: 'Remove duplicate rows' }).click();
  await expect(page.getByText('1 duplicate removed')).toBeVisible();
  await page.getByRole('checkbox', { name: 'Add a source_file column' }).click();
  await expect(page.getByText('Result: 3 rows × 4 columns')).toBeVisible();

  await page.getByRole('button', { name: 'Merge 2 files' }).click();
  await expect(page.getByText('Output (1 file)')).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('merged.csv');
  expect(await readFile((await download.path())!, 'utf-8')).toBe([
    'id,name,email,source_file',
    '1,Ann,,jan.csv',
    '2,Bob,,jan.csv',
    '3,Cy,cy@example.com,feb.csv',
  ].join('\r\n'));
});

test('merges by position after removing a file, in list order', async ({ page }) => {
  const C = { name: 'mar.csv', text: 'a,b\nx,y\n' };
  await page.goto('/csv/merge');
  await uploadWhenHydrated(page, [A, B, C]);

  const list = page.getByRole('list', { name: 'Files to merge' });
  await expect(list.getByRole('listitem')).toHaveCount(3);
  await page.getByRole('button', { name: 'Remove feb.csv' }).click();
  await expect(list.getByRole('listitem')).toHaveCount(2);

  await page.getByRole('tab', { name: 'By position' }).click();
  await expect(page.getByText('Result: 3 rows × 2 columns')).toBeVisible();

  await page.getByRole('button', { name: 'Merge 2 files' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  const download = await downloadPromise;
  expect(await readFile((await download.path())!, 'utf-8')).toBe('id,name\r\n1,Ann\r\n2,Bob\r\nx,y');
});

test('reports a file that cannot be read and keeps the others', async ({ page }) => {
  await page.goto('/csv/merge');
  await uploadWhenHydrated(page, [A, { name: 'blank.csv', text: '   \n' }]);
  await expect(page.getByText('blank.csv: That file is empty.')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Files to merge' }).getByRole('listitem')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Add another file to merge' })).toBeDisabled();
});
