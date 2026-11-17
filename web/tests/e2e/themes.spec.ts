import { expect, test, type Locator, type Page } from '@playwright/test'

import { THEMES } from '../../src/atmosphere/registry'
import { createCanvas } from './helpers'

const scenicThemes = THEMES.flatMap((theme) => (
  'scene' in theme && theme.scene ? [{ id: theme.id, label: theme.label, scene: theme.scene }] : []
))

function backgroundRgb(hex: string): string {
  const value = hex.replace('#', '')
  const red = Number.parseInt(value.slice(0, 2), 16)
  const green = Number.parseInt(value.slice(2, 4), 16)
  const blue = Number.parseInt(value.slice(4, 6), 16)
  return `rgb(${red}, ${green}, ${blue})`
}

async function openAppearance(page: Page) {
  await page.getByRole('button', { name: 'Appearance' }).click()
  const dialog = page.getByRole('dialog', { name: 'Appearance' })
  await expect(dialog).toBeVisible()
  return dialog
}

async function canvasStats(canvas: Locator) {
  return canvas.evaluate((element) => {
    const target = element as HTMLCanvasElement
    const context = target.getContext('2d')
    if (!context || target.width === 0 || target.height === 0) {
      return { width: target.width, height: target.height, opaqueRatio: 0, colours: 0 }
    }
    const pixels = context.getImageData(0, 0, target.width, target.height).data
    const step = Math.max(1, Math.floor(Math.min(target.width, target.height) / 64))
    const colours = new Set<number>()
    let opaque = 0
    let sampled = 0
    for (let y = 0; y < target.height; y += step) {
      for (let x = 0; x < target.width; x += step) {
        const offset = (y * target.width + x) * 4
        const red = pixels[offset] ?? 0
        const green = pixels[offset + 1] ?? 0
        const blue = pixels[offset + 2] ?? 0
        const alpha = pixels[offset + 3] ?? 0
        if (alpha > 0) opaque += 1
        colours.add((red << 16) | (green << 8) | blue)
        sampled += 1
      }
    }
    return {
      width: target.width,
      height: target.height,
      opaqueRatio: sampled > 0 ? opaque / sampled : 0,
      colours: colours.size,
    }
  })
}

test('applies and persists color themes', async ({ page }) => {
  await page.goto('/')
  let appearance = await openAppearance(page)
  for (const theme of THEMES) {
    const swatch = appearance.getByRole('radio', { name: theme.label, exact: true })
    await expect(swatch.locator('.theme-option-label')).toHaveText(theme.label)
    await swatch.click()
    await expect(swatch).toHaveAttribute('aria-checked', 'true')
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme.id)
    await expect(page.locator('body')).toHaveCSS('background-color', backgroundRgb(theme.themeColor))
  }

  await appearance.getByRole('radio', { name: 'Dune', exact: true }).click()
  await appearance.getByRole('button', { name: 'Close appearance' }).click()
  await page.reload()
  appearance = await openAppearance(page)
  await expect(appearance.getByRole('radio', { name: 'Dune', exact: true })).toHaveAttribute('aria-checked', 'true')
})

test('offers optional background ambience themes', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  let appearance = await openAppearance(page)
  let picker = appearance.getByLabel('Background ambience')
  await expect(picker.locator('option')).toContainText([
    'Ambience off',
    'Space sci-fi',
    'Cyberpunk',
    'Dune',
    'Medieval sci-fi',
    'Moss Circuit',
    'Tide Signal',
    'Paper Lanterns',
    'Aurora Terminal',
    'Copper Rain',
    'Night Bus',
    'Glass Meadow',
    'Vapor Line',
  ])

  for (const ambience of ['space', 'cyberpunk', 'dune', 'medieval-scifi', 'moss', 'tide', 'lantern', 'aurora', 'rain', 'nightbus', 'meadow', 'vapor']) {
    await picker.selectOption(ambience)
    await expect(picker).toHaveValue(ambience)
  }
  const volume = appearance.getByLabel('Ambience volume')
  await expect(volume).toBeVisible()
  await volume.fill('50')
  await expect(volume).toHaveValue('50')
  await expect.poll(async () => page.evaluate(() => localStorage.getItem('canvas-ambience-volume'))).toBe('0.5')
  await picker.selectOption('space')
  await appearance.getByRole('button', { name: 'Close appearance' }).click()
  appearance = await openAppearance(page)
  picker = appearance.getByLabel('Background ambience')
  await expect(picker).toHaveValue('space')
  await picker.selectOption('')
  await expect(picker).toHaveValue('')
  expect(errors).toEqual([])
})

test('shows a living pixel backdrop on scenic themes', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await createCanvas(page)
  await expect(page.locator('.canvas-flow')).toBeVisible()

  const backdrop = page.locator('.canvas-backdrop')
  const canvas = backdrop.locator('canvas')
  const appearance = await openAppearance(page)
  for (const theme of scenicThemes) {
    await test.step(`${theme.id} renders ${theme.scene}`, async () => {
      await appearance.getByRole('radio', { name: theme.label, exact: true }).click()
      await expect(backdrop).toBeVisible()
      await expect(backdrop).toHaveAttribute('data-scene', theme.scene)
      await expect(canvas).toBeVisible()
      await expect.poll(async () => {
        const stats = await canvasStats(canvas)
        return stats.width > 0
          && stats.height > 0
          && stats.opaqueRatio > 0.5
          && stats.colours >= 8
      }, { timeout: 5_000 }).toBe(true)
    })
  }

  const toggle = appearance.getByRole('switch', { name: 'Backdrop' })
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await toggle.click()
  await expect(backdrop).toBeHidden()
  await toggle.click()
  await expect(backdrop).toBeVisible()

  await appearance.getByRole('radio', { name: 'Graphite', exact: true }).click()
  await expect(backdrop).toBeHidden()
  expect(errors).toEqual([])
})

test('offers four simple edge path styles', async ({ page }) => {
  await page.goto('/')
  await createCanvas(page)
  await expect(page.locator('.canvas-flow')).toBeVisible()
  const appearance = await openAppearance(page)
  const control = appearance.getByRole('group', { name: 'Edge path style' })
  const labels = ['Bezier', 'Straight', 'Step', 'Smooth step']
  await expect(control.getByRole('button')).toHaveCount(labels.length)
  for (const label of labels) {
    const option = control.getByRole('button', { name: label, exact: true })
    await option.click()
    await expect(option).toHaveAttribute('aria-pressed', 'true')
  }
})
