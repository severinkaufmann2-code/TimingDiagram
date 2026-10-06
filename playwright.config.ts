import { defineConfig, devices } from '@playwright/test';

/**
 * The tests open the built single-file app straight from disk, the way a user
 * double-clicks it. Run `npm run build` first (`npm run test:e2e` does).
 */
export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  timeout: 90_000,
  expect: { timeout: 5_000 },
  reporter: [['list']],
  use: {
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } } },
  ],
});
