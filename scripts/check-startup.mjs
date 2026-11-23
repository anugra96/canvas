// Read-only start-up check for a served build: open the list page, fail on any page error.
// Usage: node scripts/check-startup.mjs http://127.0.0.1:8090
import console from 'node:console'
import process from 'node:process'

import { chromium } from '@playwright/test'

const url = process.argv[2]
if (!url) {
  console.error('usage: node scripts/check-startup.mjs <web url>')
  process.exit(2)
}

const browser = await chromium.launch()
const errors = []
try {
  const page = await browser.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(url)
  await page.getByRole('heading', { name: 'Canvases', exact: true }).waitFor({ timeout: 15_000 })
  // Let lazy chunks finish loading before judging.
  await page.waitForLoadState('networkidle')
} catch (error) {
  errors.push(error instanceof Error ? error.message : String(error))
} finally {
  await browser.close()
}

if (errors.length > 0) {
  console.error(`start-up check failed at ${url}:\n- ${errors.join('\n- ')}`)
  process.exit(1)
}
console.log(`start-up check passed at ${url}`)
