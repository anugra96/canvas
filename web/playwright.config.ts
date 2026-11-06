import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { defineConfig, devices } from '@playwright/test'

const canvasDataDir = mkdtempSync(join(tmpdir(), 'skyward-canvas-e2e-'))

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5174',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm run dev -w api',
      cwd: '..',
      env: {
        CANVAS_DATA_DIR: canvasDataDir,
        CANVAS_AUTH_MODE: 'local',
        CANVAS_API_PORT: '8788',
      },
      url: 'http://127.0.0.1:8788/health',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'npm run dev -w web -- --port 5174',
      cwd: '..',
      env: {
        CANVAS_API_PORT: '8788',
      },
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
})
