import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end configuration.
 *
 * The suite runs against a real dev server on port 3200 rather than a production build:
 * it is meant to be run repeatedly while the app is being written, and `reuseExistingServer`
 * means a developer who already has `npm run dev -- -p 3200` open pays no startup cost.
 *
 * Two projects, deliberately not four. Desktop Chrome covers the layouts that only exist
 * above `lg`; a Pixel 5 viewport covers the bottom navigation and the 320–768 px range.
 * Adding WebKit/Firefox here would triple the runtime for defects this suite is not
 * designed to catch — cross-browser rendering is not what these specs assert.
 */

const PORT = 3200
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],

  timeout: 45_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    // The middleware negotiates the locale from Accept-Language on the first visit, so
    // the browser locale decides whether "/" lands on /ru or /ro. Pin it.
    locale: 'ru-MD',
    timezoneId: 'Europe/Chisinau',
    actionTimeout: 10_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
      // Mobile-only specs are excluded rather than skipped, so the desktop run reports
      // no phantom "skipped" entries.
      testIgnore: ['**/responsive.spec.ts'],
    },
    {
      name: 'mobile',
      // Pixel 5 is 393×851 with touch and a mobile user agent.
      use: { ...devices['Pixel 5'] },
      testMatch: ['**/navigation.spec.ts', '**/responsive.spec.ts'],
    },
  ],

  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
