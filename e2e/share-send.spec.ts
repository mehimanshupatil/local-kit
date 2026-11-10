import { randomBytes, randomInt } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

const contexts: BrowserContext[] = [];
test.afterEach(async () => {
  await Promise.all(contexts.splice(0).map(c => c.close()));
});

// Two browser contexts stand in for two devices. Each test gets its own fake
// public IP so parallel tests land in separate discovery rooms.
async function openDevice(browser: Browser, publicIp: string): Promise<{ page: Page; name: string }> {
  const context = await browser.newContext();
  contexts.push(context);
  await context.addInitScript(ip => {
    window.__LOCALKIT_SHARE__ = {
      relayUrls: ['ws://localhost:7447'],
      iceServers: [],
      publicIp: ip,
      loopbackFallback: true,
    };
  }, publicIp);
  const page = await context.newPage();
  await page.goto('/share/send');
  const name = await page.getByText(/^You appear as/).locator('span').first().textContent();
  expect(name).toMatch(/^\w+ \w+$/);
  return { page, name: name! };
}

const fakeIp = () => `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;

async function pairUp(browser: Browser) {
  const ip = fakeIp();
  const sender = await openDevice(browser, ip);
  const receiver = await openDevice(browser, ip);
  const devices = (page: Page) => page.getByRole('list', { name: 'Nearby devices' });
  await expect(devices(sender.page).getByRole('button', { name: receiver.name })).toBeVisible({ timeout: 20_000 });
  await expect(devices(receiver.page).getByRole('button', { name: sender.name })).toBeVisible({ timeout: 20_000 });
  return { sender, receiver };
}

async function offerFile(sender: Page, receiverName: string, file: { name: string; mimeType: string; buffer: Buffer }) {
  const chooser = sender.waitForEvent('filechooser');
  await sender.getByRole('list', { name: 'Nearby devices' }).getByRole('button', { name: receiverName }).click();
  await (await chooser).setFiles(file);
}

test('discovers a device on the same network and sends a file byte for byte', async ({ browser }) => {
  const { sender, receiver } = await pairUp(browser);
  // Several full 64 KiB chunks plus a short final one
  const file = { name: 'photo.bin', mimeType: 'application/octet-stream', buffer: randomBytes(64 * 1024 * 3 + 4321) };

  await offerFile(sender.page, receiver.name, file);
  await expect(sender.page.getByText(`Waiting for ${receiver.name} to accept…`)).toBeVisible();

  const prompt = receiver.page.getByRole('alertdialog');
  await expect(prompt).toContainText(`${sender.name} wants to send you a file`);
  await expect(prompt).toContainText('photo.bin');

  const download = receiver.page.waitForEvent('download');
  await prompt.getByRole('button', { name: 'Accept' }).click();

  const saved = await download;
  expect(saved.suggestedFilename()).toBe('photo.bin');
  const bytes = await readFile((await saved.path())!);
  expect(bytes.equals(file.buffer)).toBe(true);

  await expect(sender.page.getByText(`Sent to ${receiver.name}.`)).toBeVisible();
  await expect(receiver.page.getByText('photo.bin').first()).toBeVisible();
});

test('declining tells the sender and transfers nothing', async ({ browser }) => {
  const { sender, receiver } = await pairUp(browser);
  let downloaded = false;
  receiver.page.on('download', () => { downloaded = true; });

  await offerFile(sender.page, receiver.name, { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  const prompt = receiver.page.getByRole('alertdialog');
  await prompt.getByRole('button', { name: 'Decline' }).click();

  await expect(sender.page.getByText(`${receiver.name} declined the file.`)).toBeVisible();
  await expect(prompt).toBeHidden();
  await expect(receiver.page.getByText('Receiving…')).toHaveCount(0);
  expect(downloaded).toBe(false);
});

test('fits a 400px-wide screen', async ({ browser }) => {
  const { sender, receiver } = await pairUp(browser);
  for (const page of [sender.page, receiver.page]) {
    await page.setViewportSize({ width: 400, height: 800 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  }
});
