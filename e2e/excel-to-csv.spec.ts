import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
import { buildXlsx } from './fixtures/buildXlsx';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function workbook() {
  return buildXlsx([
    {
      name: 'Orders',
      rows: [
        ['id', 'customer', 'placed', 'paid', 'total'],
        ['00042', 'Smith, J', { date: 46027 }, true, 19.5],
        ['00043', 'Lee', { date: 46028 }, false, 1234567890123],
      ],
    },
    { name: 'Q1 / Notes', rows: [['note'], ['ok']] },
  ]);
}

// The dropzone's input exists before hydration; retry the upload until the island reacts.
async function upload(page: Page, name: string, buffer: Buffer, until: () => Promise<void>) {
  await expect(async () => {
    await page.setInputFiles('input[type="file"]', { name, mimeType: XLSX_MIME, buffer });
    await until();
  }).toPass({ timeout: 30_000 });
}

test('converts the selected sheet to CSV with dates, booleans and numbers intact', async ({ page }) => {
  await page.goto('/csv/excel-to-csv');
  await upload(page, 'sales.xlsx', await workbook(), () =>
    expect(page.getByRole('button', { name: 'Convert all 2 sheets' })).toBeVisible({ timeout: 3_000 }));

  await expect(page.getByRole('cell', { name: 'Smith, J' })).toBeVisible();

  await page.getByRole('button', { name: 'Convert “Orders”' }).click();
  await expect(page.getByText('Output (1 file)')).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe('sales-Orders.csv');
  const body = await readFile((await download.path())!, 'utf-8');
  expect(body).toBe([
    'id,customer,placed,paid,total',
    '00042,"Smith, J",2026-01-05,TRUE,19.5',
    '00043,Lee,2026-01-06,FALSE,1234567890123',
  ].join('\r\n'));
});

test('exports every sheet at once with filename-safe sheet names', async ({ page }) => {
  await page.goto('/csv/excel-to-csv');
  await upload(page, 'sales.xlsx', await workbook(), () =>
    expect(page.getByRole('button', { name: 'Convert all 2 sheets' })).toBeVisible({ timeout: 3_000 }));

  await page.getByRole('button', { name: 'Convert all 2 sheets' }).click();
  await expect(page.getByText('Output (2 files)')).toBeVisible();
  await expect(page.getByText('sales-Orders.csv')).toBeVisible();
  await expect(page.getByText('sales-Q1-Notes.csv')).toBeVisible();
});

test('shows an error for a corrupt workbook', async ({ page }) => {
  await page.goto('/csv/excel-to-csv');
  await upload(page, 'broken.xlsx', Buffer.from('definitely not a zip'), () =>
    expect(page.getByText('Could not read this file')).toBeVisible({ timeout: 3_000 }));
});
