import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  use: {
    baseURL: 'http://127.0.0.1:5181',
    viewport: { width: 1440, height: 900 },
    launchOptions: { executablePath: process.env.CHROME_EXECUTABLE },
  },
  webServer: {
    command: 'npm run dev -- --port 5181 --strictPort',
    url: 'http://127.0.0.1:5181/api/status',
    env: { CLOTHSY_API_KEY: '' },
  },
});
