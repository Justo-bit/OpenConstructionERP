// Wave V_REPORTING — standalone Playwright config for /reports panel
// smoke. Runs against the local dev stack (vite 5193 + backend 8023).

import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.OE_TEST_BASE_URL ?? 'http://localhost:5193';

export default defineConfig({
  testDir: '.',
  testMatch: ['V_REPORTING.spec.ts'],
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  outputDir: '../qa-screenshots/V_REPORTING',
  use: {
    baseURL: BASE_URL,
    headless: true,
    screenshot: 'on',
    trace: 'retain-on-failure',
    ignoreHTTPSErrors: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
