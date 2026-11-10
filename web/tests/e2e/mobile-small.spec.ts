import { expect, test } from '@playwright/test'
import { createCanvas } from './helpers'

test.use({
  viewport: { width: 320, height: 568 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
})

test('fits a 320px viewport without horizontal overflow', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'New canvas' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)

  await createCanvas(page)
  await expect(page.locator('.mobile-toolbar')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
})
