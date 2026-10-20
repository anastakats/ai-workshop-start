// The demos: demo/*.demo.ts, in Chromium, against e2e/server.ts; each one a video in demo-videos/.
import { defineConfig, devices } from '@playwright/test';

const port = 3200;

export default defineConfig({
  // DEMO_DIR: other demos than demo/, as tests/demo.test.ts runs.
  testDir: process.env.DEMO_DIR ?? 'demo',
  testMatch: '*.demo.ts',
  outputDir: 'demo-results',
  // One at a time: a video is easier to follow without other tests competing for the CPU.
  workers: 1,
  timeout: 120_000,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    viewport: { width: 1280, height: 720 },
    video: { mode: 'on', size: { width: 1280, height: 720 } },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        // Another Chromium than Playwright's own, where its download is not possible.
        launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {},
      },
    },
  ],
  webServer: { command: 'node e2e/server.ts', env: { PORT: String(port) }, url: `http://localhost:${port}/`, reuseExistingServer: false },
});
