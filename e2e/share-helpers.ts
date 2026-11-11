import { randomInt } from 'node:crypto';
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

const contexts: BrowserContext[] = [];
/** Close every device opened by the current test; call from afterEach. */
export async function closeDevices() {
  await Promise.all(contexts.splice(0).map(c => c.close()));
}

export type Device = { page: Page; name: string };
export type Upload = { name: string; mimeType: string; buffer: Buffer };

// Two browser contexts stand in for two devices. Each test gets its own fake
// public IP so parallel tests land in separate discovery rooms.
export interface DeviceOptions {
  /** Page to open; a pairing link, say. */
  path?: string;
  folderPicker?: boolean;
  touch?: boolean;
  clipboard?: boolean;
  userAgent?: string;
  /** Browser permissions to grant, e.g. camera and microphone. */
  permissions?: string[];
  /** Runs in the page before anything else, e.g. to stub an API. */
  initScript?: string;
  /** Extra share config, e.g. to make connections fail. */
  config?: Record<string, unknown>;
}

export async function openDevice(
  browser: Browser,
  publicIp: string,
  {
    path = '/share/send', folderPicker = false, touch = false, clipboard = false, userAgent, permissions = [], initScript,
    config = {},
  }: DeviceOptions = {},
): Promise<Device> {
  const context = await browser.newContext({ hasTouch: touch, isMobile: touch, userAgent });
  const grants = [...permissions, ...(clipboard ? ['clipboard-read', 'clipboard-write'] : [])];
  if (grants.length) await context.grantPermissions(grants);
  if (initScript) await context.addInitScript(initScript);
  contexts.push(context);
  await context.addInitScript(({ ip, folderPicker, config }) => {
    window.__LOCALKIT_SHARE__ = {
      relayUrls: ['ws://localhost:7447'],
      iceServers: [],
      publicIp: ip,
      loopbackFallback: true,
      ...config,
    };
    // The real picker needs a user to choose a folder; the origin-private file
    // system is a real FileSystemDirectoryHandle the test can read back
    if (folderPicker) window.showDirectoryPicker = () => navigator.storage.getDirectory();
    else delete (window as Partial<Window>).showDirectoryPicker;
  }, { ip: publicIp, folderPicker, config });
  const page = await context.newPage();
  await page.goto(path);
  return { page, name: await ownName(page) };
}

export async function ownName(page: Page) {
  const name = await page.getByText(/^You appear as/).locator('span').first().textContent();
  expect(name).toBeTruthy();
  return name!;
}

export const fakeIp = () => `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
export const devices = (page: Page) => page.getByRole('list', { name: 'Devices' });

/** Tap a device and choose "Send files" or "Send text" from its menu. */
export async function chooseSend(page: Page, deviceName: string, what: 'Send files' | 'Send text') {
  await devices(page).getByRole('button', { name: deviceName }).click();
  await page.getByRole('dialog', { name: `Send to ${deviceName}` }).getByRole('button', { name: what }).click();
}

export async function pairUp(
  browser: Browser,
  options: { receiverFolderPicker?: boolean; senderTouch?: boolean; receiverClipboard?: boolean } = {},
) {
  const ip = fakeIp();
  const sender = await openDevice(browser, ip, { touch: options.senderTouch });
  const receiver = await openDevice(browser, ip, { folderPicker: options.receiverFolderPicker, clipboard: options.receiverClipboard });
  await expect(devices(sender.page).getByRole('button', { name: receiver.name })).toBeVisible({ timeout: 30_000 });
  await expect(devices(receiver.page).getByRole('button', { name: sender.name })).toBeVisible({ timeout: 30_000 });
  return { sender, receiver };
}
