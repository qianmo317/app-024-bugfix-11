import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:5204',
    locale: 'zh-CN',
  },
  webServer: {
    command: 'npm run preview -- --port 5204 --strictPort',
    port: 5204,
    reuseExistingServer: false,
    timeout: 30000,
  },
});
