import { test, expect } from '@playwright/test';
// A hydration mismatch makes React rebuild the whole layout tree, remounting every
// tool island inside it (which, for Share, means re-joining the peer room).
for (const path of ['/', '/archive/create', '/csv/merge', '/share/send', '/privacy']) {
  test(`no hydration error on ${path}`, async ({ page }) => {
    const errs: string[] = [];
    page.on('pageerror', e => errs.push(e.message.slice(0, 80)));
    await page.goto(path);
    await page.waitForTimeout(3000);
    expect(errs).toEqual([]);
  });
}
