import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
import { closeDevices, devices, fakeIp, openDevice, ownName, pairUp, type Upload } from './share-helpers';

// Pairing waits on two cold page loads plus WebRTC setup
test.describe.configure({ timeout: 60_000 });

test.afterEach(closeDevices);

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

test('right-click sends text; the receiver accepts, sees safe links and can copy it', async ({ browser }) => {
  const { sender, receiver } = await pairUp(browser, { receiverClipboard: true });
  const text = 'Meeting notes: https://example.com/agenda?id=7.\nNot a link: javascript:alert(1)\nsecond line';

  await devices(sender.page).getByRole('button', { name: receiver.name }).click({ button: 'right' });
  const compose = sender.page.getByRole('dialog', { name: `Send text to ${receiver.name}` });
  await compose.getByRole('textbox', { name: 'Message' }).fill(text);
  await compose.getByRole('button', { name: 'Send' }).click();
  await expect(compose).toBeHidden();
  await expect(sender.page.getByText(`Waiting for ${receiver.name} to accept…`)).toBeVisible();

  const prompt = receiver.page.getByRole('alertdialog');
  await expect(prompt).toContainText(`${sender.name} wants to send you text`);
  await expect(prompt).toContainText(`${text.length} characters`);
  // Nothing is shown before accepting
  await expect(receiver.page.getByText('Meeting notes')).toHaveCount(0);
  await prompt.getByRole('button', { name: 'Accept' }).click();

  const note = receiver.page.getByLabel(`Text from ${sender.name}`);
  await expect(note).toContainText('Meeting notes:');
  await expect(note).toContainText('second line');
  await expect(sender.page.getByText(`Sent to ${receiver.name}.`)).toBeVisible();

  // Only the http(s) URL is a link, without the sentence's full stop, and it opens safely
  const links = note.getByRole('link');
  await expect(links).toHaveCount(1);
  await expect(links).toHaveAttribute('href', 'https://example.com/agenda?id=7');
  await expect(links).toHaveAttribute('rel', /noopener/);
  await expect(links).toHaveAttribute('target', '_blank');

  await note.getByRole('button', { name: 'Copy' }).click();
  await expect(note.getByRole('button', { name: 'Copied' })).toBeVisible();
  expect(await receiver.page.evaluate(() => navigator.clipboard.readText())).toBe(text);
});

test('long-press on touch opens the text box instead of the file picker; tap still picks files', async ({ browser }) => {
  const { sender, receiver } = await pairUp(browser, { senderTouch: true });
  const device = devices(sender.page).getByRole('button', { name: receiver.name });
  const box = (await device.boundingBox())!;
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const cdp = await sender.page.context().newCDPSession(sender.page);

  let pickerOpened = false;
  sender.page.on('filechooser', () => { pickerOpened = true; });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await sender.page.waitForTimeout(800);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

  const compose = sender.page.getByRole('dialog', { name: `Send text to ${receiver.name}` });
  await expect(compose).toBeVisible();
  await sender.page.waitForTimeout(500);
  expect(pickerOpened).toBe(false);

  await compose.getByRole('textbox', { name: 'Message' }).fill('hello from my phone');
  await compose.getByRole('button', { name: 'Send' }).click();
  await receiver.page.getByRole('alertdialog').getByRole('button', { name: 'Decline' }).click();
  await expect(sender.page.getByLabel(`Text to ${receiver.name}`).getByText(`${receiver.name} declined.`)).toBeVisible();
  await expect(receiver.page.getByLabel(`Text from ${sender.name}`)).toHaveCount(0);

  // A short tap is still "send files"
  const chooser = sender.page.waitForEvent('filechooser');
  await device.tap();
  await chooser;
});

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';

test('shows each device with its type and browser', async ({ browser }) => {
  const ip = fakeIp();
  const laptop = await openDevice(browser, ip);
  const phone = await openDevice(browser, ip, { userAgent: IPHONE_SAFARI });

  await expect(devices(laptop.page).getByRole('button', { name: phone.name })).toContainText('Safari on iPhone', { timeout: 30_000 });
  await expect(devices(phone.page).getByRole('button', { name: laptop.name })).toContainText(/Chrome on (Mac|Windows|Linux)/, { timeout: 30_000 });
  // Each device also sees its own description
  await expect(phone.page.getByText('Safari on iPhone')).toBeVisible();
});

test('a rename shows up on the other device straight away and survives a reload', async ({ browser }) => {
  const { sender, receiver } = await pairUp(browser);

  await receiver.page.getByRole('button', { name: 'Rename this device' }).click();
  const field = receiver.page.getByRole('textbox', { name: 'Device name' });
  await field.fill('  Kitchen   Laptop ');
  await field.press('Enter');

  await expect(receiver.page.getByText(/^You appear as/)).toContainText('Kitchen Laptop');
  await expect(devices(sender.page).getByRole('button', { name: 'Kitchen Laptop' })).toBeVisible();

  await receiver.page.reload();
  expect(await ownName(receiver.page)).toBe('Kitchen Laptop');
  await expect(devices(sender.page).getByRole('button', { name: 'Kitchen Laptop' })).toBeVisible({ timeout: 30_000 });
});

test('turning visibility off hides this device until it is turned back on', async ({ browser }) => {
  const { sender, receiver } = await pairUp(browser);
  const visible = receiver.page.getByRole('switch', { name: 'Visible to others' });
  await expect(visible).toBeChecked();

  await visible.click();
  await expect(receiver.page.getByText(/^Hidden\. Other devices can't find this one/)).toBeVisible();
  await expect(devices(sender.page).getByRole('button', { name: receiver.name })).toHaveCount(0, { timeout: 20_000 });

  // The choice is remembered, and a hidden device never touches the relay — not even briefly while loading
  const relayConnections: string[] = [];
  receiver.page.on('websocket', ws => { if (ws.url().includes(':7447')) relayConnections.push(ws.url()); });
  await receiver.page.reload();
  await expect(receiver.page.getByRole('switch', { name: 'Visible to others' })).not.toBeChecked();
  await receiver.page.waitForTimeout(3000);
  expect(relayConnections).toEqual([]);
  await expect(devices(sender.page).getByRole('button', { name: receiver.name })).toHaveCount(0);

  await receiver.page.getByRole('switch', { name: 'Visible to others' }).click();
  await expect(devices(sender.page).getByRole('button', { name: receiver.name })).toBeVisible({ timeout: 30_000 });
});

test('says when it is offline and recovers when the network returns', async ({ browser }) => {
  const { sender, receiver } = await pairUp(browser);
  const offline = sender.page.getByText(/^You're offline\./);

  await sender.page.context().setOffline(true);
  await expect(offline).toBeVisible();
  await sender.page.context().setOffline(false);
  await expect(offline).toBeHidden();
  await expect(devices(sender.page).getByRole('button', { name: receiver.name })).toBeVisible({ timeout: 30_000 });
});

test('explains a failed direct connection instead of failing silently', async ({ browser }) => {
  const ip = fakeIp();
  // Relay-only ICE with no TURN server: the devices find each other but can never connect
  const config = { iceTransportPolicy: 'relay' };
  const a = await openDevice(browser, ip, { config });
  await openDevice(browser, ip, { config });

  const notice = a.page.getByText(/couldn't connect to it directly/);
  await expect(notice).toBeVisible({ timeout: 45_000 });
  await expect(devices(a.page)).toHaveCount(0);
  await a.page.getByRole('button', { name: 'Dismiss' }).click();
  await expect(notice).toBeHidden();
});
