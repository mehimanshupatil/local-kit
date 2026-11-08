import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';

const ROWS = 3000;

interface Row { id: number; name: string; amount: string; joined: string }

function dataset(): Row[] {
  return Array.from({ length: ROWS }, (_, k) => {
    const i = k + 1;
    const day = String((i % 28) + 1).padStart(2, '0');
    return {
      id: i,
      name: `user${i}`,
      // Every 500th amount is blank to exercise "empties last" and the empty count.
      amount: i % 500 === 0 ? '' : String((i * 37) % 1000 + 0.5),
      joined: `2024-0${(i % 9) + 1}-${day}`,
    };
  });
}

function toCsv(rows: Row[]): string {
  return ['id,name,amount,joined', ...rows.map(r => `${r.id},${r.name},${r.amount},${r.joined}`)].join('\n');
}

// The dropzone's input exists before hydration; retry the upload until the island reacts.
async function upload(page: Page, name: string, body: string, until: () => Promise<void>) {
  await expect(async () => {
    await page.setInputFiles('input[type="file"]', { name, mimeType: 'text/csv', buffer: Buffer.from(body) });
    await until();
  }).toPass({ timeout: 30_000 });
}

const firstRow = (page: Page) => page.locator('tbody tr[data-index="0"]');
// Cell 0 is the row number; data columns start at 1.
const firstRowCell = (page: Page, col: number) => firstRow(page).locator('td').nth(col + 1);

test('views, searches, sorts, summarises and exports a large CSV', async ({ page }) => {
  const rows = dataset();
  await page.goto('/csv/viewer');
  await upload(page, 'people.csv', toCsv(rows), () =>
    expect(page.getByText('3,000 of 3,000 rows')).toBeVisible({ timeout: 3_000 }));

  await expect(firstRowCell(page, 1)).toHaveText('user1');
  // Virtualised: far fewer DOM rows than data rows.
  expect(await page.locator('tbody tr[data-index]').count()).toBeLessThan(200);

  // Search narrows (user123, user1230–user1239).
  const search = page.getByRole('searchbox', { name: 'Search rows' });
  await search.fill('USER123');
  await expect(page.getByText('11 of 3,000 rows')).toBeVisible();
  await expect(firstRowCell(page, 1)).toHaveText('user123');
  await search.fill('');
  await expect(page.getByText('3,000 of 3,000 rows')).toBeVisible();

  // Header click cycles asc → desc → none, numerically.
  const amounts = rows.map(r => r.amount).filter(a => a !== '').map(Number);
  const sortButton = page.getByRole('button', { name: 'amount', exact: true });
  await sortButton.click();
  await expect(page.getByRole('columnheader', { name: 'amount' })).toHaveAttribute('aria-sort', 'ascending');
  await expect(firstRowCell(page, 2)).toHaveText(String(Math.min(...amounts)));
  await sortButton.click();
  await expect(firstRowCell(page, 2)).toHaveText(String(Math.max(...amounts)));
  await sortButton.click();
  await expect(firstRowCell(page, 1)).toHaveText('user1');

  // Column stats for the numeric column.
  await page.getByRole('combobox', { name: 'Stats column' }).click();
  await page.getByRole('option', { name: 'amount' }).click();
  const stat = (label: string) => page.locator('dl > div').filter({ has: page.getByText(label, { exact: true }) }).locator('dd');
  await expect(stat('Type')).toHaveText('number');
  await expect(stat('Empty')).toHaveText(String(ROWS / 500));
  await expect(stat('Non-empty')).toHaveText((ROWS - ROWS / 500).toLocaleString('en-US'));
  await expect(stat('Min')).toHaveText(Math.min(...amounts).toLocaleString('en-US'));
  await expect(stat('Max')).toHaveText(Math.max(...amounts).toLocaleString('en-US'));
  const sum = amounts.reduce((a, b) => a + b, 0);
  await expect(stat('Sum')).toHaveText(sum.toLocaleString('en-US', { maximumFractionDigits: 4 }));

  // Export the filtered + sorted view.
  await search.fill('user299');
  await expect(page.getByText('11 of 3,000 rows')).toBeVisible();
  await sortButton.click(); // asc by amount
  await page.getByRole('button', { name: 'Export view as CSV' }).click();
  await expect(page.getByText('Output (1 file)')).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('people-view.csv');

  const expected = rows
    .filter(r => r.name.includes('user299'))
    .sort((a, b) => (a.amount === '' ? 1 : b.amount === '' ? -1 : Number(a.amount) - Number(b.amount)));
  const body = await readFile((await download.path())!, 'utf-8');
  expect(body.split('\r\n')).toEqual([
    'id,name,amount,joined',
    ...expected.map(r => `${r.id},${r.name},${r.amount},${r.joined}`),
  ]);
});

test('shows an error for an empty file', async ({ page }) => {
  await page.goto('/csv/viewer');
  await upload(page, 'empty.csv', '', () =>
    expect(page.getByText('That file is empty.')).toBeVisible({ timeout: 3_000 }));
});
