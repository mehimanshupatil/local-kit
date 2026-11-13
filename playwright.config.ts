import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  globalTeardown: './e2e/global-teardown.ts',
  fullyParallel: true,
  // Every spec hits the dev server, which compiles each tool's island on first
  // request; more parallel cold compiles than this push hydration past the
  // specs' 30s retry window on a laptop. CI's runner already defaults lower.
  workers: process.env.CI ? undefined : 3,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list']] : [['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4321',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: './e2e/dev-server.sh',
      url: 'http://localhost:4321',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      // Local stand-in for public Nostr relays, used by the Share specs
      command: 'node e2e/nostr-relay.mjs',
      port: 7447,
      reuseExistingServer: false,
      timeout: 10_000,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Headless Chromium hides local IPs behind mDNS names it can't resolve,
        // so Share peers on one machine would never connect
        launchOptions: { args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] },
      },
    },
  ],
});
