import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';

const CSV = [
  'region,product,sales,units',
  'North,Apples,"$1,200.50",10',
  'South,Apples,$800,5',
  'North,Pears,300,2',
  'East,Pears,n/a,1',
  'West,Plums,450,4',
  'East,Plums,1.5k,9',
].join('\n');

// The dropzone's input exists before hydration; retry the upload until the island reacts.
async function upload(page: Page, name: string, body: string, until: () => Promise<void>) {
  await expect(async () => {
    await page.setInputFiles('input[type="file"]', { name, mimeType: 'text/csv', buffer: Buffer.from(body) });
    await until();
  }).toPass({ timeout: 30_000 });
}

async function choose(page: Page, combobox: string, option: string) {
  await page.getByRole('combobox', { name: combobox }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

const bars = (page: Page) => page.locator('.recharts-bar-rectangle');
const slices = (page: Page) => page.locator('.recharts-pie-sector');

test('charts numeric columns with aggregation and exports a PNG', async ({ page }) => {
  await page.goto('/csv/chart');
  await upload(page, 'sales.csv', CSV, () =>
    expect(page.getByRole('combobox', { name: 'Chart type' })).toBeVisible({ timeout: 3_000 }));

  // Defaults: region labels, first numeric column (sales); one bar per row with a numeric value.
  await expect(bars(page)).toHaveCount(5);
  await expect(page.getByText('1 value was skipped (empty or not a number).')).toBeVisible();

  // Sum repeated regions → North, South, East, West.
  await choose(page, 'Aggregation', 'Sum');
  await expect(bars(page)).toHaveCount(4);

  // A second value column doubles the bars.
  await page.getByRole('checkbox', { name: 'units' }).click();
  await expect(bars(page)).toHaveCount(8);

  // Pie keeps a single value column: one slice per region.
  await choose(page, 'Chart type', 'Pie');
  await expect(slices(page)).toHaveCount(4);

  // Top-N with "Other": 2 slices + Other.
  await page.getByLabel('Show at most').fill('2');
  await expect(slices(page)).toHaveCount(3);
  await expect(page.getByText('2 more items grouped into “Other”.')).toBeVisible();

  await page.getByLabel('Chart title').fill('Sales by region');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PNG' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('Sales-by-region.png');
  const png = await readFile((await download.path())!);
  expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(png.length).toBeGreaterThan(2000);
});

test('downloads a standalone SVG with resolved colours', async ({ page }) => {
  await page.goto('/csv/chart');
  await upload(page, 'sales.csv', CSV, () =>
    expect(page.getByRole('combobox', { name: 'Chart type' })).toBeVisible({ timeout: 3_000 }));
  await expect(bars(page)).toHaveCount(5);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download SVG' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('sales-chart.svg');
  const svg = await readFile((await download.path())!, 'utf-8');
  expect(svg.startsWith('<svg')).toBe(true);
  expect(svg).not.toContain('var(--color-');
  expect(svg.match(/recharts-bar-rectangle(?!s)/g)?.length).toBe(5);
});

test('explains when there are no numeric columns', async ({ page }) => {
  await page.goto('/csv/chart');
  await upload(page, 'words.csv', 'a,b\nx,y\nz,w', () =>
    expect(page.getByText('No numeric columns found')).toBeVisible({ timeout: 3_000 }));
});
