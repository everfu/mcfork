import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', workers: 1, timeout: 45000,
  outputDir: '/tmp/mcfork-test-results', reporter: 'list',
  use: { baseURL: process.env.MCFORK_BASE_URL ?? 'http://127.0.0.1:5175', channel: 'chrome', headless: true, viewport: { width: 1512, height: 1050 }, screenshot: 'only-on-failure' },
});
