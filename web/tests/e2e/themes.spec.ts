import { expect, test, type Locator } from '@playwright/test'

import { THEMES } from '../../src/atmosphere/registry'
import { createCanvas } from './helpers'

const scenicThemes = THEMES.flatMap((theme) => (
  'scene' in theme && theme.scene ? [{ id: theme.id, scene: theme.scene }] : []
))

function backgroundRgb(hex: string): string {
  const value = hex.replace('#', '')
  const red = Number.parseInt(value.slice(0, 2), 16)
  const green = Number.parseInt(value.slice(2, 4), 16)
  const blue = Number.parseInt(value.slice(4, 6), 16)
  return `rgb(${red}, ${green}, ${blue})`
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
  const picker = page.getByLabel('Color theme')
  await expect(picker).toBeVisible()

  for (const theme of THEMES) {
    await picker.selectOption(theme.id)
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme.id)
    await expect(page.locator('body')).toHaveCSS('background-color', backgroundRgb(theme.themeColor))
  }

  await picker.selectOption('dune')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dune')
  await expect(page.getByLabel('Color theme')).toHaveValue('dune')
})

test('offers optional background ambience themes', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  const picker = page.getByLabel('Background ambience')
  await expect(picker).toBeVisible()
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
  const volume = page.getByLabel('Ambience volume')
  await expect(volume).toBeVisible()
  await volume.fill('50')
  await expect(volume).toHaveValue('50')
  await expect.poll(async () => page.evaluate(() => localStorage.getItem('canvas-ambience-volume'))).toBe('0.5')
  await picker.selectOption('')
  await expect(picker).toHaveValue('')
  expect(errors).toEqual([])
})

test('shows a living pixel backdrop on scenic themes', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await createCanvas(page)

  const backdrop = page.locator('.canvas-backdrop')
  const canvas = backdrop.locator('canvas')
  for (const theme of scenicThemes) {
    await test.step(`${theme.id} renders ${theme.scene}`, async () => {
      await page.getByLabel('Color theme').selectOption(theme.id)
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

  await page.getByLabel('Color theme').selectOption('dune')
  const toggle = page.getByRole('button', { name: 'Toggle animated backdrop' })
  await toggle.click()
  await expect(backdrop).toBeHidden()
  await toggle.click()
  await expect(backdrop).toBeVisible()

  await page.getByLabel('Color theme').selectOption('graphite')
  await expect(backdrop).toBeHidden()
  expect(errors).toEqual([])
})

test('offers four simple edge path styles', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New canvas' }).click()
  await page.getByLabel('Canvas name').fill('Edge paths')
  await page.getByRole('button', { name: 'Create canvas' }).click()
  const picker = page.getByLabel('Edge path style')
  await expect(picker.locator('option')).toContainText([
    'Bezier',
    'Straight',
    'Step',
    'Smooth step',
  ])
  for (const style of ['bezier', 'straight', 'step', 'smoothstep']) {
    await picker.selectOption(style)
    await expect(picker).toHaveValue(style)
  }
})
