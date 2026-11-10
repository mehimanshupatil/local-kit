import { createHash, randomBytes, randomInt } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

// Pairing waits on two cold page loads plus WebRTC setup
test.describe.configure({ timeout: 60_000 });

const contexts: BrowserContext[] = [];
test.afterEach(async () => {
  await Promise.all(contexts.splice(0).map(c => c.close()));
});

type Device = { page: Page; name: string };
type Upload = { name: string; mimeType: string; buffer: Buffer };

// Two browser contexts stand in for two devices. Each test gets its own fake
// public IP so parallel tests land in separate discovery rooms.
async function openDevice(browser: Browser, publicIp: string, { folderPicker = false } = {}): Promise<Device> {
  const context = await browser.newContext();
  contexts.push(context);
  await context.addInitScript(({ ip, folderPicker }) => {
    window.__LOCALKIT_SHARE__ = {
      relayUrls: ['ws://localhost:7447'],
      iceServers: [],
      publicIp: ip,
      loopbackFallback: true,
    };
    // The real picker needs a user to choose a folder; the origin-private file
    // system is a real FileSystemDirectoryHandle the test can read back
    if (folderPicker) window.showDirectoryPicker = () => navigator.storage.getDirectory();
    else delete (window as Partial<Window>).showDirectoryPicker;
  }, { ip: publicIp, folderPicker });
  const page = await context.newPage();
  await page.goto('/share/send');
  const name = await page.getByText(/^You appear as/).locator('span').first().textContent();
  expect(name).toMatch(/^\w+ \w+$/);
  return { page, name: name! };
}

const fakeIp = () => `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
const devices = (page: Page) => page.getByRole('list', { name: 'Nearby devices' });

async function pairUp(browser: Browser, options: { receiverFolderPicker?: boolean } = {}) {
  const ip = fakeIp();
  const sender = await openDevice(browser, ip);
  const receiver = await openDevice(browser, ip, { folderPicker: options.receiverFolderPicker });
  await expect(devices(sender.page).getByRole('button', { name: receiver.name })).toBeVisible({ timeout: 30_000 });
  await expect(devices(receiver.page).getByRole('button', { name: sender.name })).toBeVisible({ timeout: 30_000 });
  return { sender, receiver };
}

async function offerFiles(sender: Page, receiverName: string, files: Upload[]) {
  const chooser = sender.waitForEvent('filechooser');
  await devices(sender).getByRole('button', { name: receiverName }).click();
  await (await chooser).setFiles(files);
}

const transferCard = (page: Page, direction: 'Sending to' | 'Receiving from', peer: string) =>
  page.getByLabel(`${direction} ${peer}`);

const bin = (name: string, size: number): Upload => ({ name, mimeType: 'application/octet-stream', buffer: randomBytes(size) });
// Big enough that a transfer is still running when the test clicks Cancel
const BIG = 40 * 1024 * 1024;
// The cancel message queues behind chunks already in the data channel, and
// loopback WebRTC under parallel test load can stall for seconds
const CROSS_DEVICE_MS = 20_000;

test('discovers a device on the same network and sends a file byte for byte', async ({ browser }) => {
  const { sender, receiver } = await pairUp(browser);
  // Several full chunks plus a short final one
  const file = bin('photo.bin', 16 * 1024 * 3 + 4321);

  await offerFiles(sender.page, receiver.name, [file]);
  await expect(sender.page.getByText(`Waiting for ${receiver.name} to accept…`)).toBeVisible();

  const prompt = receiver.page.getByRole('alertdialog');
  await expect(prompt).toContainText(`${sender.name} wants to send you a file`);
  await expect(prompt).toContainText('photo.bin');

  const download = receiver.page.waitForEvent('download');
  await prompt.getByRole('button', { name: 'Accept' }).click();

  const saved = await download;
  expect(saved.suggestedFilename()).toBe('photo.bin');
  expect((await readFile((await saved.path())!)).equals(file.buffer)).toBe(true);

  await expect(sender.page.getByText(`Sent to ${receiver.name}.`)).toBeVisible();
  await expect(receiver.page.getByText(`Received from ${sender.name}.`)).toBeVisible();
});

test('sends several files, including an empty one, complete and in order', async ({ browser }) => {
  const { sender, receiver } = await pairUp(browser);
  const files = [bin('first.bin', 300_000), { name: 'empty.txt', mimeType: 'text/plain', buffer: Buffer.alloc(0) }, bin('third.bin', 150_001)];

  await offerFiles(sender.page, receiver.name, files);
  const prompt = receiver.page.getByRole('alertdialog');
  await expect(prompt).toContainText(`${sender.name} wants to send you 3 files`);
  await prompt.getByRole('button', { name: 'Accept' }).click();

  await expect(sender.page.getByText(`Sent to ${receiver.name}.`)).toBeVisible();
  await expect(receiver.page.getByText(`Received from ${sender.name}.`)).toBeVisible();

  // Per-file progress on both sides, all finished
  for (const card of [transferCard(sender.page, 'Sending to', receiver.name), transferCard(receiver.page, 'Receiving from', sender.name)]) {
    await expect(card.getByRole('list', { name: 'Files' }).getByRole('listitem')).toHaveCount(3);
    await expect(card.getByText('100%')).toHaveCount(3);
  }

  // Several files wait in the output list rather than auto-downloading; check each one's bytes
  const output = receiver.page.locator('[data-slot="card"]').filter({ has: receiver.page.getByRole('heading', { name: /Output \(3 files\)/ }) });
  const rows = output.getByRole('button', { name: 'Download', exact: true });
  await expect(rows).toHaveCount(3);
  for (const [i, file] of files.entries()) {
    const download = receiver.page.waitForEvent('download');
    await rows.nth(i).click();
    const saved = await download;
    expect(saved.suggestedFilename()).toBe(file.name);
    expect((await readFile((await saved.path())!)).equals(file.buffer)).toBe(true);
  }
});

test('declining tells the sender and transfers nothing', async ({ browser }) => {
  const { sender, receiver } = await pairUp(browser);
  let downloaded = false;
  receiver.page.on('download', () => { downloaded = true; });

  await offerFiles(sender.page, receiver.name, [{ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') }]);
  const prompt = receiver.page.getByRole('alertdialog');
  await prompt.getByRole('button', { name: 'Decline' }).click();

  await expect(sender.page.getByText(`${receiver.name} declined.`)).toBeVisible();
  await expect(prompt).toBeHidden();
  await expect(transferCard(receiver.page, 'Receiving from', sender.name)).toHaveCount(0);
  expect(downloaded).toBe(false);
});

test('the sender can withdraw an offer before it is answered', async ({ browser }) => {
  const { sender, receiver } = await pairUp(browser);
  await offerFiles(sender.page, receiver.name, [bin('draft.bin', 1000)]);
  const prompt = receiver.page.getByRole('alertdialog');
  await expect(prompt).toBeVisible();

  await transferCard(sender.page, 'Sending to', receiver.name).getByRole('button', { name: 'Cancel' }).click();

  await expect(sender.page.getByText('You cancelled the transfer.')).toBeVisible();
  await expect(prompt).toBeHidden();
});

test('the receiver can cancel mid-transfer and both sides stop', async ({ browser }) => {
  const { sender, receiver } = await pairUp(browser);
  let downloaded = false;
  receiver.page.on('download', () => { downloaded = true; });

  await offerFiles(sender.page, receiver.name, [bin('movie.bin', BIG)]);
  await receiver.page.getByRole('alertdialog').getByRole('button', { name: 'Accept' }).click();

  const incoming = transferCard(receiver.page, 'Receiving from', sender.name);
  // Speed shows once a couple of progress samples are in
  await expect(incoming.getByText(/Receiving… · [\d.]+ (B|KB|MB)\/s/)).toBeVisible();
  await incoming.getByRole('button', { name: 'Cancel' }).click();

  await expect(incoming.getByText('You cancelled the transfer.')).toBeVisible();
  await expect(sender.page.getByText(`${receiver.name} cancelled the transfer.`)).toBeVisible({ timeout: CROSS_DEVICE_MS });
  await expect(incoming.getByRole('button', { name: 'Cancel' })).toHaveCount(0);
  expect(downloaded).toBe(false);
});

test('the sender can cancel mid-transfer and both sides stop', async ({ browser }) => {
  const { sender, receiver } = await pairUp(browser);
  await offerFiles(sender.page, receiver.name, [bin('movie.bin', BIG)]);
  await receiver.page.getByRole('alertdialog').getByRole('button', { name: 'Accept' }).click();

  const outgoing = transferCard(sender.page, 'Sending to', receiver.name);
  await expect(outgoing.getByText(/Sending… · [\d.]+ (B|KB|MB)\/s/)).toBeVisible();
  await outgoing.getByRole('button', { name: 'Cancel' }).click();

  await expect(outgoing.getByText('You cancelled the transfer.')).toBeVisible();
  await expect(receiver.page.getByText(`${sender.name} cancelled the transfer.`)).toBeVisible({ timeout: CROSS_DEVICE_MS });
  await expect(receiver.page.getByRole('heading', { name: /Output/ })).toHaveCount(0);
});

test('saves straight to a folder where the browser supports it', async ({ browser }) => {
  const { sender, receiver } = await pairUp(browser, { receiverFolderPicker: true });
  const files = [bin('a.bin', 200_000), bin('b.bin', 50_000)];

  await offerFiles(sender.page, receiver.name, files);
  const prompt = receiver.page.getByRole('alertdialog');
  await prompt.getByRole('button', { name: 'Save to folder…' }).click();

  // The origin-private root has no name, so this is the nameless-folder wording
  await expect(receiver.page.getByText('Saved to the folder you chose.')).toBeVisible();
  await expect(sender.page.getByText(`Sent to ${receiver.name}.`)).toBeVisible();
  // Written to disk, so nothing is held in memory for the output list
  await expect(receiver.page.getByRole('heading', { name: /Output/ })).toHaveCount(0);

  const hashes = await receiver.page.evaluate(async names => {
    const dir = await navigator.storage.getDirectory();
    const out: Record<string, string> = {};
    for (const name of names) {
      const bytes = await (await (await dir.getFileHandle(name)).getFile()).arrayBuffer();
      out[name] = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
    }
    return out;
  }, files.map(f => f.name));
  for (const f of files) expect(hashes[f.name]).toBe(createHash('sha256').update(f.buffer).digest('hex'));
});

test('fits a 400px-wide screen', async ({ browser }) => {
  const { sender, receiver } = await pairUp(browser);
  for (const page of [sender.page, receiver.page]) {
    await page.setViewportSize({ width: 400, height: 800 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  }
});
