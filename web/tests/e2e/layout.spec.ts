import { expect, test } from '@playwright/test'

import { createCanvas } from './helpers'

test('fits the list and editor at 320, 375, and 390 px', async ({ page }) => {
  await page.goto('/')
  for (const width of [320, 375, 390]) {
    await page.setViewportSize({ width, height: 800 })
    await expect.poll(async () => page.evaluate(() => (
      document.documentElement.scrollWidth - window.innerWidth
    ))).toBeLessThanOrEqual(1)
  }

  await page.setViewportSize({ width: 390, height: 800 })
  await createCanvas(page)
  for (const width of [320, 375, 390]) {
    await page.setViewportSize({ width, height: 800 })
    await expect(page.locator('.canvas-flow')).toBeVisible()
    await expect.poll(async () => page.evaluate(() => (
      document.documentElement.scrollWidth - window.innerWidth
    ))).toBeLessThanOrEqual(1)
  }
})

test('keeps the desktop editor chrome compact', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.getByLabel('Canvas type').selectOption('systems')
  await createCanvas(page)

  const controlCount = await page.locator('.editor-toolbar').evaluate((toolbar) => (
    [...toolbar.querySelectorAll('button, select, input, [role="button"]')]
      .filter((element) => {
        const rect = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden'
      })
      .length
  ))
  expect(controlCount).toBeLessThanOrEqual(10)
  const canvas = await page.locator('.canvas-flow').boundingBox()
  expect(canvas?.y ?? 999).toBeLessThanOrEqual(72)
})
