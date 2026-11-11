import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
import { closeDevices, devices, fakeIp, openDevice, type Device } from './share-helpers';

// Each test opens two or three cold pages and waits on WebRTC setup
test.describe.configure({ timeout: 90_000 });
test.afterEach(closeDevices);

const pairDialog = (page: Page) => page.getByRole('dialog');

/** Open "Pair a device" and read the code and link it shows. */
async function showCode(page: Page) {
  await page.getByRole('button', { name: 'Pair a device' }).click();
  const dialog = pairDialog(page);
  const code = dialog.getByLabel('Pairing code');
  await expect(code).toHaveText(/^[a-z]+-[a-z]+-\d\d$/);
  return { code: (await code.textContent())!, link: await dialog.getByRole('textbox', { name: 'Pairing link' }).inputValue() };
}

async function enterCode(page: Page, code: string) {
  await page.getByRole('button', { name: 'Pair a device' }).click();
  const dialog = pairDialog(page);
  await dialog.getByRole('tab', { name: 'Enter a code' }).click();
  await dialog.getByLabel('Code from the other device').fill(code);
  await dialog.getByRole('button', { name: 'Pair', exact: true }).click();
}

async function safetyEmojis(page: Page) {
  const emojis = pairDialog(page).getByLabel('Safety emojis');
  await expect(emojis).toBeVisible({ timeout: 45_000 });
  return emojis.textContent();
}

/** Both sides see the same emojis and confirm; each then lists the other as paired. */
async function confirmPair(a: Device, b: Device) {
  const [emojisA, emojisB] = await Promise.all([safetyEmojis(a.page), safetyEmojis(b.page)]);
  expect(emojisA).toBe(emojisB);
  expect([...new Intl.Segmenter().segment(emojisA!.replace(/\s/g, ''))]).toHaveLength(4);
  await expect(pairDialog(a.page)).toContainText(`Paired with ${b.name}`);
  await expect(pairDialog(b.page)).toContainText(`Paired with ${a.name}`);
  for (const [self, other] of [[a, b], [b, a]] as const) {
    await pairDialog(self.page).getByRole('button', { name: 'They match' }).click();
    await expect(pairDialog(self.page)).toBeHidden();
    await expect(devices(self.page).getByRole('button', { name: other.name })).toContainText('Paired');
  }
}

test('pairs devices on different networks with a typed code, even while hidden, then sends a file', async ({ browser }) => {
  // Different public IPs: auto-discovery can't find them
  const laptop = await openDevice(browser, fakeIp());
  const phone = await openDevice(browser, fakeIp());
  await expect(laptop.page.getByText('Looking for nearby devices…')).toBeVisible();

  // Hidden devices can still pair with a code
  await laptop.page.getByRole('switch', { name: 'Visible to others' }).click();
  await expect(laptop.page.getByText(/^Hidden\./)).toBeVisible();

  const { code } = await showCode(laptop.page);
  // Typed loosely, as a person would
  await enterCode(phone.page, code.toUpperCase().replace(/-/g, ' '));
  await confirmPair(laptop, phone);

  const file = { name: 'boarding-pass.pdf', mimeType: 'application/pdf', buffer: randomBytes(70_000) };
  const chooser = phone.page.waitForEvent('filechooser');
  await devices(phone.page).getByRole('button', { name: laptop.name }).click();
  await (await chooser).setFiles(file);
  const download = laptop.page.waitForEvent('download');
  await laptop.page.getByRole('alertdialog').getByRole('button', { name: 'Accept' }).click();
  expect((await readFile((await (await download).path())!)).equals(file.buffer)).toBe(true);
});

test('pairs by opening the link from the QR code, and clears the secret from the address bar', async ({ browser }) => {
  const laptop = await openDevice(browser, fakeIp());
  const { link } = await showCode(laptop.page);
  expect(new URL(link).hash).toMatch(/^#pair=[\w-]{22}$/);

  const phone = await openDevice(browser, fakeIp(), { path: new URL(link).pathname + new URL(link).hash });
  await confirmPair(laptop, phone);
  expect(new URL(phone.page.url()).hash).toBe('');
});

test('a used code turns away a third device', async ({ browser }) => {
  const a = await openDevice(browser, fakeIp());
  const b = await openDevice(browser, fakeIp());
  const intruder = await openDevice(browser, fakeIp(), { config: { pairingJoinTimeoutMs: 8_000 } });

  const { code } = await showCode(a.page);
  await enterCode(b.page, code);
  await confirmPair(a, b);

  await enterCode(intruder.page, code);
  await expect(pairDialog(intruder.page).getByRole('alert')).toBeVisible({ timeout: 30_000 });
  await expect(devices(intruder.page)).toHaveCount(0);
  await expect(devices(a.page).getByRole('button')).toHaveCount(1);
});

test('rejecting the safety check disconnects both sides', async ({ browser }) => {
  const a = await openDevice(browser, fakeIp());
  const b = await openDevice(browser, fakeIp());
  const { code } = await showCode(a.page);
  await enterCode(b.page, code);
  await safetyEmojis(a.page);
  await safetyEmojis(b.page);

  await pairDialog(b.page).getByRole('button', { name: "They don't match" }).click();
  await expect(pairDialog(b.page)).toContainText(`Disconnected from ${a.name}`);
  await expect(pairDialog(a.page)).toContainText(`Disconnected from ${b.name}`, { timeout: 20_000 });
  await expect(devices(a.page)).toHaveCount(0);
  await expect(devices(b.page)).toHaveCount(0);
});

test('a code expires, and a new one can be made', async ({ browser }) => {
  const a = await openDevice(browser, fakeIp(), { config: { pairingTtlMs: 3_000 } });
  const { code } = await showCode(a.page);
  await expect(pairDialog(a.page).getByRole('alert')).toContainText('That code expired', { timeout: 10_000 });

  await pairDialog(a.page).getByRole('button', { name: 'Make a new code' }).click();
  const fresh = pairDialog(a.page).getByLabel('Pairing code');
  await expect(fresh).toHaveText(/^[a-z]+-[a-z]+-\d\d$/);
  expect(await fresh.textContent()).not.toBe(code);
});

test('says when a typed code is malformed or nobody is showing it', async ({ browser }) => {
  const a = await openDevice(browser, fakeIp(), { config: { pairingJoinTimeoutMs: 3_000 } });
  await a.page.getByRole('button', { name: 'Pair a device' }).click();
  const dialog = pairDialog(a.page);
  await dialog.getByRole('tab', { name: 'Enter a code' }).click();

  await dialog.getByLabel('Code from the other device').fill('not a real code');
  await dialog.getByRole('button', { name: 'Pair', exact: true }).click();
  await expect(dialog.getByText(/doesn't look like a pairing code/)).toBeVisible();

  await dialog.getByLabel('Code from the other device').fill('tiger-maple-42');
  await dialog.getByRole('button', { name: 'Pair', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('No device is showing that code', { timeout: 15_000 });
});
