// The end-to-end tests: e2e/, in Chromium, against e2e/server.ts.
import { defineConfig, devices } from '@playwright/test';

const port = 3100;

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `http://localhost:${port}`, trace: 'retain-on-failure' },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Another Chromium than Playwright's own, where its download is not possible.
        launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {},
      },
    },
  ],
  webServer: { command: 'node e2e/server.ts', env: { PORT: String(port) }, url: `http://localhost:${port}/`, reuseExistingServer: false },
});
