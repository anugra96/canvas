import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { defineConfig, devices } from '@playwright/test'

const canvasDataDir = mkdtempSync(join(tmpdir(), 'canvas-prod-e2e-'))

export default defineConfig({
  testDir: './tests/prod',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:5175',
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
        CANVAS_API_PORT: '8786',
      },
      url: 'http://127.0.0.1:8786/health',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'npm run preview -w web -- --port 5175 --strictPort',
      cwd: '..',
      env: {
        CANVAS_API_PORT: '8786',
      },
      url: 'http://127.0.0.1:5175',
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
})
