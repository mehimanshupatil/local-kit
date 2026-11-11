import { test, expect, type Browser, type Page } from '@playwright/test';
import { closeDevices, devices, fakeIp, openDevice, type Device } from './share-helpers';

// Chromium's fake camera (a moving test pattern) and microphone (a beep), with the permission prompt auto-accepted
test.use({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } });
test.describe.configure({ timeout: 90_000 });
test.afterEach(closeDevices);

const MEDIA = ['camera', 'microphone'];

async function openCallers(browser: Browser, receiverInitScript?: string, caller: { initScript?: string; userAgent?: string; touch?: boolean } = {}) {
  const ip = fakeIp();
  const callerDevice = await openDevice(browser, ip, { path: '/share/call', permissions: MEDIA, ...caller });
  const callee = await openDevice(browser, ip, { path: '/share/call', permissions: MEDIA, initScript: receiverInitScript });
  return pairCallers(callerDevice, callee);
}

async function pairCallers(caller: Device, callee: Device) {
  await expect(devices(caller.page).getByRole('button', { name: callee.name })).toBeVisible({ timeout: 30_000 });
  await expect(devices(callee.page).getByRole('button', { name: caller.name })).toBeVisible({ timeout: 30_000 });
  return { caller, callee };
}

/** True once the named video element is showing moving frames from the other side. */
async function expectVideoPlaying(page: Page, label: string | RegExp) {
  const video = page.getByLabel(label);
  await expect(video).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 30_000 }).toBeGreaterThan(0);
  const t0 = await video.evaluate((v: HTMLVideoElement) => v.currentTime);
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 10_000 }).toBeGreaterThan(t0);
}

async function startCall({ caller, callee }: { caller: Device; callee: Device }) {
  await devices(caller.page).getByRole('button', { name: callee.name }).click();
  await expect(caller.page.getByText(`Calling ${callee.name}…`)).toBeVisible();
  const ring = callee.page.getByRole('alertdialog');
  await expect(ring).toContainText(`${caller.name} is calling`);
  return ring;
}

test('a call connects both ways; mute and camera-off show on the other side; hanging up ends it for both', async ({ browser }) => {
  const pair = await openCallers(browser);
  const { caller, callee } = pair;

  const ring = await startCall(pair);
  await ring.getByRole('button', { name: 'Accept' }).click();

  // Each side sees and hears the other
  await expectVideoPlaying(caller.page, `Video from ${callee.name}`);
  await expectVideoPlaying(callee.page, `Video from ${caller.name}`);
  for (const [page, from] of [[caller.page, callee.name], [callee.page, caller.name]] as const) {
    const audio = await page.getByLabel(`Video from ${from}`).evaluate((v: HTMLVideoElement) => {
      const tracks = (v.srcObject as MediaStream).getAudioTracks();
      return tracks.map(t => t.readyState);
    });
    expect(audio).toEqual(['live']);
  }
  // While in the call, the device list is out of the way and visibility can't change underneath it
  await expect(devices(caller.page)).toHaveCount(0);

  // Mute
  await caller.page.getByRole('button', { name: 'Mute microphone' }).click();
  await expect(caller.page.getByRole('button', { name: 'Unmute microphone' })).toHaveAttribute('aria-pressed', 'true');
  await expect(callee.page.getByText(`${caller.name} is muted`)).toBeVisible();
  expect(await caller.page.evaluate(() => {
    const v = document.querySelector<HTMLVideoElement>('video[aria-label="Your camera"]')!;
    return (v.srcObject as MediaStream).getAudioTracks().every(t => !t.enabled);
  })).toBe(true);
  await caller.page.getByRole('button', { name: 'Unmute microphone' }).click();
  await expect(callee.page.getByText(`${caller.name} is muted`)).toBeHidden();

  // Camera off
  await callee.page.getByRole('button', { name: 'Turn camera off' }).click();
  await expect(caller.page.getByText(`${callee.name}'s camera is off`)).toBeVisible();
  await callee.page.getByRole('button', { name: 'Turn camera on' }).click();
  await expect(caller.page.getByText(`${callee.name}'s camera is off`)).toBeHidden();

  // Hang up
  await callee.page.getByRole('button', { name: 'Hang up' }).click();
  await expect(callee.page.getByText('Call ended.')).toBeVisible();
  await expect(caller.page.getByText(`${callee.name} hung up.`)).toBeVisible({ timeout: 20_000 });
  // Both cameras are off again and the device list is back
  for (const page of [caller.page, callee.page]) {
    await expect(page.getByLabel('Your camera')).toHaveCount(0);
    await expect(devices(page).getByRole('button')).toHaveCount(1);
  }
});

test('declining tells the caller and never turns the other camera on', async ({ browser }) => {
  // Count camera requests on the callee
  const countCamera = `
    window.__cameraRequests = 0;
    const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = c => { window.__cameraRequests++; return real(c); };
  `;
  const pair = await openCallers(browser, countCamera);
  const ring = await startCall(pair);
  await ring.getByRole('button', { name: 'Decline' }).click();

  await expect(pair.caller.page.getByText(`${pair.callee.name} didn't answer.`)).toBeVisible();
  await expect(pair.caller.page.getByLabel('Your camera')).toHaveCount(0);
  expect(await pair.callee.page.evaluate(() => (window as unknown as { __cameraRequests: number }).__cameraRequests)).toBe(0);
});

test('the caller can cancel while it rings', async ({ browser }) => {
  const pair = await openCallers(browser);
  const ring = await startCall(pair);
  await pair.caller.page.getByRole('button', { name: 'Cancel' }).click();
  await expect(ring).toBeHidden({ timeout: 20_000 });
  await expect(pair.caller.page.getByLabel('Your camera')).toHaveCount(0);
});

test('explains a blocked camera instead of failing silently', async ({ browser }) => {
  const deny = `
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
  `;
  const pair = await openCallers(browser, deny);

  // The callee can't answer: they see why, and the caller hears no answer
  const ring = await startCall(pair);
  await ring.getByRole('button', { name: 'Accept' }).click();
  await expect(pair.callee.page.getByText(/isn't allowed to use your camera and microphone/)).toBeVisible();
  await expect(pair.caller.page.getByText(`${pair.callee.name} didn't answer.`)).toBeVisible();

  // Calling out from the blocked device explains the same way
  await devices(pair.callee.page).getByRole('button', { name: pair.caller.name }).click();
  await expect(pair.callee.page.getByText(/isn't allowed to use your camera and microphone/)).toBeVisible();
  await expect(pair.caller.page.getByRole('alertdialog')).toHaveCount(0);
});

test('Send and Call find only devices on the same tool', async ({ browser }) => {
  const ip = fakeIp();
  const onCall = await openDevice(browser, ip, { path: '/share/call', permissions: MEDIA });
  const onSend = await openDevice(browser, ip);
  const alsoOnCall = await openDevice(browser, ip, { path: '/share/call', permissions: MEDIA });

  await expect(devices(onCall.page).getByRole('button', { name: alsoOnCall.name })).toBeVisible({ timeout: 30_000 });
  await expect(onSend.page.getByText('Looking for nearby devices…')).toBeVisible();
  await expect(devices(onCall.page).getByRole('button')).toHaveCount(1);
  await expect(devices(onSend.page)).toHaveCount(0);
});

/** Answered call between two fresh devices, with each side's remote video playing. */
async function connectedCall(browser: Browser, caller: { initScript?: string; userAgent?: string; touch?: boolean } = {}) {
  const pair = await openCallers(browser, undefined, caller);
  const ring = await startCall(pair);
  await ring.getByRole('button', { name: 'Accept' }).click();
  await expectVideoPlaying(pair.callee.page, `Video from ${pair.caller.name}`);
  return pair;
}

const remoteWidth = (page: Page, from: string) =>
  page.getByLabel(`Video from ${from}`).evaluate((v: HTMLVideoElement) => v.videoWidth);

// An animated canvas with an unusual size stands in for the screen picker's result
const SCREEN_WIDTH = 500;
const FAKE_SCREEN = `
  navigator.mediaDevices.getDisplayMedia = async () => {
    const canvas = Object.assign(document.createElement('canvas'), { width: ${SCREEN_WIDTH}, height: 100 });
    const ctx = canvas.getContext('2d');
    let n = 0;
    setInterval(() => { ctx.fillStyle = 'hsl(' + (n++ * 7) % 360 + ' 80% 50%)'; ctx.fillRect(0, 0, ${SCREEN_WIDTH}, 100); }, 50);
    const stream = canvas.captureStream(20);
    window.__screenTrack = stream.getVideoTracks()[0];
    return stream;
  };
`;

test('shares the screen in place of the camera and switches back, from the button or the browser', async ({ browser }) => {
  const { caller, callee } = await connectedCall(browser, { initScript: FAKE_SCREEN });
  // The camera's resolution ramps up as WebRTC estimates bandwidth, so "the camera again" below means "not the screen's size"
  expect(await remoteWidth(callee.page, caller.name)).not.toBe(SCREEN_WIDTH);

  const share = caller.page.getByRole('button', { name: 'Share your screen' });
  await share.click();
  await expect(caller.page.getByRole('button', { name: 'Stop sharing your screen' })).toHaveAttribute('aria-pressed', 'true');
  await expect(callee.page.getByText(`${caller.name} is sharing their screen`)).toBeVisible();
  await expect.poll(() => remoteWidth(callee.page, caller.name), { timeout: 20_000 }).toBe(SCREEN_WIDTH);
  // Turning the camera off makes no sense while the screen is going out
  await expect(caller.page.getByRole('button', { name: 'Turn camera off' })).toBeDisabled();

  await caller.page.getByRole('button', { name: 'Stop sharing your screen' }).click();
  await expect(callee.page.getByText(`${caller.name} is sharing their screen`)).toBeHidden();
  await expect.poll(() => remoteWidth(callee.page, caller.name), { timeout: 20_000 }).not.toBe(SCREEN_WIDTH);

  // The browser's own "Stop sharing" bar ends the screen track
  await caller.page.getByRole('button', { name: 'Share your screen' }).click();
  await expect(callee.page.getByText(`${caller.name} is sharing their screen`)).toBeVisible();
  await caller.page.evaluate(() => (window as unknown as { __screenTrack: MediaStreamTrack }).__screenTrack.dispatchEvent(new Event('ended')));
  await expect(callee.page.getByText(`${caller.name} is sharing their screen`)).toBeHidden();
  await expect.poll(() => remoteWidth(callee.page, caller.name), { timeout: 20_000 }).not.toBe(SCREEN_WIDTH);
});

test('hides screen sharing where it is unsupported, and camera switching with one camera', async ({ browser }) => {
  const noScreen = 'delete MediaDevices.prototype.getDisplayMedia;';
  const desktop = await connectedCall(browser, { initScript: noScreen });
  await expect(desktop.caller.page.getByRole('button', { name: 'Mute microphone' })).toBeVisible();
  await expect(desktop.caller.page.getByRole('button', { name: 'Share your screen' })).toHaveCount(0);
  // Chromium's fake device is a single camera
  await expect(desktop.caller.page.getByRole('button', { name: 'Switch camera' })).toHaveCount(0);

  const phoneUA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
  // Emulated as a real phone, so the browser reports itself as mobile, not just in its user agent string
  const phone = await connectedCall(browser, { initScript: FAKE_SCREEN, userAgent: phoneUA, touch: true });
  await expect(phone.caller.page.getByRole('button', { name: 'Mute microphone' })).toBeVisible();
  await expect(phone.caller.page.getByRole('button', { name: 'Share your screen' })).toHaveCount(0);
});

test('switches between cameras without dropping the call', async ({ browser }) => {
  // Two cameras; asking for the second by ID returns Chromium's fake camera
  const twoCameras = `
    window.__cameraRequests = [];
    const realList = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
    const realGet = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.enumerateDevices = async () => {
      const devices = await realList();
      return [...devices, { kind: 'videoinput', deviceId: 'back-camera', label: 'Back camera', groupId: 'g2', toJSON() { return this; } }];
    };
    navigator.mediaDevices.getUserMedia = c => {
      const id = c && c.video && c.video.deviceId && c.video.deviceId.exact;
      if (id) window.__cameraRequests.push(id);
      return realGet(id ? { video: true } : c);
    };
  `;
  const { caller, callee } = await connectedCall(browser, { initScript: twoCameras });
  await caller.page.getByRole('button', { name: 'Switch camera' }).click();

  await expect.poll(() => caller.page.evaluate(() => (window as unknown as { __cameraRequests: string[] }).__cameraRequests)).toEqual(['back-camera']);
  // Still a live call with moving video on the other side
  await expectVideoPlaying(callee.page, `Video from ${caller.name}`);
  await expect(callee.page.getByText(/hung up|dropped/)).toHaveCount(0);
});

test('shows connection quality from the call statistics', async ({ browser }) => {
  const { caller } = await connectedCall(browser);
  const badge = caller.page.getByRole('status', { name: /^Connection quality: (good|fair|poor), \d+ ms round trip, [\d.]+% packets lost$/ });
  await expect(badge).toBeVisible({ timeout: 15_000 });
  // Two machines' worth of loopback is a good connection
  await expect(badge).toHaveAccessibleName(/^Connection quality: good/);
});

test('pops the other person into picture-in-picture where the browser supports it', async ({ browser }) => {
  const { caller } = await connectedCall(browser);
  await expect(caller.page.getByRole('button', { name: 'Mute microphone' })).toBeVisible();
  const supported = await caller.page.evaluate(() => document.pictureInPictureEnabled);
  const pip = caller.page.getByRole('button', { name: 'Picture in picture' });
  if (!supported) {
    await expect(pip).toHaveCount(0);
    return;
  }
  await expectVideoPlaying(caller.page, /^Video from /);
  await pip.click();
  await expect.poll(() => caller.page.evaluate(() => document.pictureInPictureElement?.getAttribute('aria-label') ?? null))
    .toMatch(/^Video from /);
  await caller.page.getByRole('button', { name: 'Hang up' }).click();
  await expect.poll(() => caller.page.evaluate(() => document.pictureInPictureElement)).toBeNull();
});
