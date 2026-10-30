// Playwright config. Practices from X (Oct 2026): trace on first retry, JSON report so flaky
// tests stay visible, web-first assertions only. See /workspace/team-context/web-testing-checklist.md
import { defineConfig } from '@playwright/test';
const PORT = 8833;
const BASE = process.env.BASE_URL || `http://127.0.0.1:${PORT}/`;
export default defineConfig({
  testDir: './specs',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: process.env.BASE_URL ? 1 : 0,
  workers: 4,
  reporter: [['list'], ['json', { outputFile: 'results/report.json' }]],
  use: { baseURL: BASE, trace: 'on-first-retry', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
  ],
  webServer: process.env.BASE_URL ? undefined : {
    command: `python3 -m http.server ${PORT} --bind 127.0.0.1 --directory ..`,
    url: BASE, reuseExistingServer: true,
  },
});
