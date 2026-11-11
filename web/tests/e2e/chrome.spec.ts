import { expect, test } from '@playwright/test'

import { createCanvas } from './helpers'

const widths = [1440, 1920]

test('keeps the desktop bar typography, control heights, and centre aligned', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Canvas type').selectOption('systems')
  await createCanvas(page)

  for (const width of widths) {
    await test.step(`${width}px`, async () => {
      await page.setViewportSize({ width, height: 900 })
      const bar = page.locator('.desktop-toolbar')
      await expect(bar).toBeVisible()

      const styleViolations = await bar.evaluate((element) => {
        const targets = [
          ...element.querySelectorAll('button, h1, .profile-badge, .save-status, .save-status-text'),
        ]
        return targets.flatMap((target) => {
          const style = getComputedStyle(target)
          const spacing = style.letterSpacing
          const weight = Number(style.fontWeight)
          const violations: string[] = []
          if (style.textTransform === 'uppercase') violations.push(`uppercase:${target.textContent}`)
          if (spacing !== 'normal' && Number.parseFloat(spacing) !== 0) violations.push(`tracking:${target.textContent}`)
          if (Number.isFinite(weight) && weight > 600) violations.push(`weight:${target.textContent}`)
          return violations
        })
      })
      expect(styleViolations).toEqual([])

      const heights = await bar.evaluate((element) => (
        [...element.querySelectorAll('button, select, input, [role="button"]')]
          .filter((control) => {
            const rect = control.getBoundingClientRect()
            return rect.width > 0 && rect.height > 0
          })
          .map((control) => Math.round(control.getBoundingClientRect().height))
      ))
      expect(heights.length).toBeGreaterThan(0)
      expect(new Set(heights)).toEqual(new Set([30]))

      const offset = await bar.evaluate((element) => {
        const group = element.querySelector('.bar-group-primary')
        if (!group) return Number.POSITIVE_INFINITY
        const barRect = element.getBoundingClientRect()
        const groupRect = group.getBoundingClientRect()
        return Math.abs(
          (groupRect.left + groupRect.width / 2)
          - (barRect.left + barRect.width / 2),
        )
      })
      expect(offset).toBeLessThanOrEqual(4)
    })
  }
})

test('keeps menu and sheet chrome typography consistent', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.getByLabel('Canvas type').selectOption('systems')
  await createCanvas(page)

  for (const menu of [
    { trigger: 'Add', popup: '.command-menu-popup', row: '.command-menu-item', height: 32 },
    { trigger: 'More canvas actions', popup: '.command-menu-popup', row: '.command-menu-item', height: 32 },
    { trigger: 'Account menu', popup: '.avatar-popup', row: '.avatar-panel .button', height: 32 },
  ]) {
    await test.step(menu.trigger, async () => {
      await page.getByRole('button', { name: menu.trigger, exact: menu.trigger === 'Add' }).click()
      const popup = page.locator(menu.popup)
      await expect(popup).toBeVisible()
      const violations = await popup.evaluate((element) => {
        return [...element.querySelectorAll('button, h2, span, kbd')].flatMap((target) => {
          const style = getComputedStyle(target)
          const spacing = style.letterSpacing
          const weight = Number(style.fontWeight)
          const violations: string[] = []
          if (style.textTransform === 'uppercase') violations.push(`uppercase:${target.textContent}`)
          if (spacing !== 'normal' && Number.parseFloat(spacing) !== 0) violations.push(`tracking:${target.textContent}`)
          if (Number.isFinite(weight) && weight > 600) violations.push(`weight:${target.textContent}`)
          return violations
        })
      })
      expect(violations).toEqual([])
      const heights = await popup.locator(menu.row).evaluateAll((rows) => (
        rows.map((row) => Math.round(row.getBoundingClientRect().height))
      ))
      expect(new Set(heights)).toEqual(new Set([menu.height]))
      await page.keyboard.press('Escape')
    })
  }

  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'More canvas actions' }).click()
  const sheet = page.locator('.command-sheet')
  await expect(sheet).toBeVisible()
  const sheetHeights = await sheet.locator('.command-sheet-item').evaluateAll((rows) => (
    rows.map((row) => Math.round(row.getBoundingClientRect().height))
  ))
  expect(new Set(sheetHeights)).toEqual(new Set([44]))
})
