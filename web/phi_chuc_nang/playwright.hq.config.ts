import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '05_do_giao_dien.spec.ts',
  outputDir: './ket_qua/playwright',
  workers: 1,
  retries: 0,
  timeout: 0,
  expect: { timeout: 20_000 },
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:5095',
    extraHTTPHeaders: { 'X-Requested-With': 'XMLHttpRequest' },
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
    screenshot: 'only-on-failure',
  },
});
