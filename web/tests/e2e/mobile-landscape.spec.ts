import { expect, test } from '@playwright/test'
import { createCanvas } from './helpers'

test.use({
  viewport: { width: 844, height: 390 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
})

test('uses the compact editor in phone landscape', async ({ page }) => {
  await page.goto('/')
  await createCanvas(page)
  await page.waitForSelector('.canvas-flow')

  const toolbar = await page.locator('.mobile-toolbar').boundingBox()
  const flow = await page.locator('.canvas-flow').boundingBox()
  expect(toolbar?.height ?? 999).toBeLessThan(60)
  expect(flow?.width).toBe(844)
  expect(flow?.height ?? 0).toBeGreaterThan(250)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
})
