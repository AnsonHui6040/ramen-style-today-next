import { defineConfig, devices } from '@playwright/test'

const previewBaseUrl = process.env.PREVIEW_BASE_URL

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: 'line',
  outputDir: '../../output/playwright/artifacts',
  use: {
    baseURL: previewBaseUrl ?? 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
  webServer: previewBaseUrl ? undefined : {
    command: 'npm run dev --workspace @ramen-style/web -- --port 4173',
    cwd: '../..',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
