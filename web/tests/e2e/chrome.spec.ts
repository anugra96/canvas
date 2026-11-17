import { expect, test } from '@playwright/test'

import { THEMES } from '../../src/atmosphere/registry'
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

  const extraViolations = await sheet.locator('.command-sheet-extra').evaluate((element) => (
    [...element.querySelectorAll('button, h2, span, label, select')].flatMap((target) => {
      const style = getComputedStyle(target)
      const spacing = style.letterSpacing
      const weight = Number(style.fontWeight)
      const errors: string[] = []
      if (style.textTransform === 'uppercase') errors.push(`uppercase:${target.textContent}`)
      if (spacing !== 'normal' && Number.parseFloat(spacing) !== 0) errors.push(`tracking:${target.textContent}`)
      if (Number.isFinite(weight) && weight > 600) errors.push(`weight:${target.textContent}`)
      return errors
    })
  ))
  expect(extraViolations).toEqual([])
})

test('keeps the appearance popover compact and keyboard accessible', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await createCanvas(page)
  await expect(page.locator('.canvas-flow')).toBeVisible()
  await page.getByRole('button', { name: 'Appearance' }).click()
  const popup = page.getByRole('dialog', { name: 'Appearance' })
  await expect(popup).toBeVisible()

  const width = await popup.evaluate((element) => Math.round(element.getBoundingClientRect().width))
  expect(width).toBe(360)

  const violations = await popup.evaluate((element) => (
    [...element.querySelectorAll('button, h2, span, label, select')].flatMap((target) => {
      const style = getComputedStyle(target)
      const spacing = style.letterSpacing
      const weight = Number(style.fontWeight)
      const errors: string[] = []
      if (style.textTransform === 'uppercase') errors.push(`uppercase:${target.textContent}`)
      if (spacing !== 'normal' && Number.parseFloat(spacing) !== 0) errors.push(`tracking:${target.textContent}`)
      if (Number.isFinite(weight) && weight > 600) errors.push(`weight:${target.textContent}`)
      return errors
    })
  ))
  expect(violations).toEqual([])

  const overlaps = await popup.evaluate((element) => (
    [...element.querySelectorAll('.appearance-row')].flatMap((row) => {
      const label = row.querySelector('.appearance-label')
      const value = row.querySelector('.appearance-value')
      if (!label || !value) return []
      const labelRect = label.getBoundingClientRect()
      const valueRect = value.getBoundingClientRect()
      return labelRect.right > valueRect.left ? [`${label.textContent} overlaps`] : []
    })
  ))
  expect(overlaps).toEqual([])

  const graphite = popup.getByRole('radio', { name: 'Graphite', exact: true })
  const paper = popup.getByRole('radio', { name: 'Paper', exact: true })
  await graphite.focus()
  await page.keyboard.press('ArrowRight')
  await expect(paper).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(paper).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper')
})


test('keeps bar and appearance text above 4.5 contrast across themes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.getByLabel('Canvas type').selectOption('systems')
  await createCanvas(page)
  await expect(page.locator('.canvas-flow')).toBeVisible()
  await page.getByRole('button', { name: 'Appearance' }).click()
  const popup = page.getByRole('dialog', { name: 'Appearance' })

  for (const theme of THEMES) {
    await test.step(theme.label, async () => {
      await popup.getByRole('radio', { name: theme.label, exact: true }).click()
      const failures = await page.evaluate(() => {
        type Rgba = { r: number; g: number; b: number; a: number }
        function parse(value: string): Rgba {
          const match = value.match(/rgba?\(([^)]+)\)/)
          if (!match) throw new Error(`Unsupported colour: ${value}`)
          const parts = match[1]!.split(/[ ,/]+/).filter(Boolean).map(Number)
          return { r: parts[0] ?? 0, g: parts[1] ?? 0, b: parts[2] ?? 0, a: parts[3] ?? 1 }
        }
        function over(fg: Rgba, bg: Rgba): Rgba {
          const a = fg.a + bg.a * (1 - fg.a)
          return {
            r: (fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a,
            g: (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a,
            b: (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a,
            a,
          }
        }
        function luminance(color: Rgba): number {
          const channel = (value: number) => {
            const next = value / 255
            return next <= 0.03928 ? next / 12.92 : ((next + 0.055) / 1.055) ** 2.4
          }
          return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b)
        }
        function contrast(fg: Rgba, bg: Rgba): number {
          const a = luminance(fg)
          const b = luminance(bg)
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
        }
        const bar = document.querySelector('.desktop-toolbar')!
        const popup = document.querySelector('.appearance-popup')!
        const barBg = parse(getComputedStyle(bar).backgroundColor)
        const popupBg = parse(getComputedStyle(popup).backgroundColor)
        const select = popup.querySelector('.ambience-select')!
        const selectBg = over(parse(getComputedStyle(select).backgroundColor), popupBg)
        const targets: Array<[string, Element, Rgba]> = [
          ['title', bar.querySelector('.canvas-title-text')!, barBg],
          ['back', bar.querySelector('.bar-back')!, barBg],
          ['views', bar.querySelector('.bar-group-primary .bar-button:nth-of-type(1)')!, barBg],
          ['profile', bar.querySelector('.profile-badge')!, barBg],
          ['save', bar.querySelector('.save-status')!, barBg],
          ['popup title', popup.querySelector('h2')!, popupBg],
          ['appearance label', popup.querySelector('.appearance-label')!, popupBg],
          ['theme current', popup.querySelector('.theme-current')!, popupBg],
          ['ambience select', select, selectBg],
        ]
        return targets.flatMap(([name, element, bg]) => {
          const fg = over(parse(getComputedStyle(element).color), bg)
          const ratio = contrast(fg, bg)
          return ratio < 4.5 ? [`${name}:${ratio.toFixed(2)}`] : []
        })
      })
      expect(failures).toEqual([])
    })
  }
})


test('shows Views and Review only when the profile makes them available', async ({ page }) => {
  const cases = [
    { profile: 'raw', type: 'Raw canvas', views: 0, review: 0 },
    { profile: 'systems', type: 'Systems', views: 1, review: 1 },
  ]
  for (const expected of cases) {
    await test.step(expected.type, async () => {
      await page.goto('/')
      if (expected.profile === 'systems') {
        await page.getByLabel('Canvas type').selectOption('systems')
      }
      await createCanvas(page)
      await expect(page.locator('.canvas-flow')).toBeVisible()
      await expect(page.locator('.profile-badge')).toHaveText(expected.type)
      await expect(page.getByRole('button', { name: 'Views', exact: true })).toHaveCount(expected.views)
      await expect(page.getByRole('button', { name: /^Review,/ })).toHaveCount(expected.review)
    })
  }
})
