import { expect, test } from '@playwright/test'

import { createCanvas } from './helpers'

const themes = [
  { id: 'graphite', background: 'rgb(11, 13, 16)' },
  { id: 'paper', background: 'rgb(244, 241, 234)' },
  { id: 'dune', background: 'rgb(14, 10, 6)' },
  { id: 'dune-light', background: 'rgb(243, 226, 189)' },
  { id: 'abyss', background: 'rgb(6, 16, 20)' },
  { id: 'ember', background: 'rgb(18, 14, 11)' },
  { id: 'kelp', background: 'rgb(12, 18, 14)' },
  { id: 'glacier', background: 'rgb(233, 238, 242)' },
  { id: 'plum', background: 'rgb(16, 13, 19)' },
  { id: 'lagoon', background: 'rgb(228, 240, 238)' },
  { id: 'cinder', background: 'rgb(20, 12, 10)' },
  { id: 'dusk', background: 'rgb(12, 14, 24)' },
  { id: 'fern', background: 'rgb(233, 242, 226)' },
  { id: 'marigold', background: 'rgb(247, 232, 201)' },
  { id: 'clay', background: 'rgb(242, 221, 208)' },
  { id: 'blossom', background: 'rgb(247, 236, 236)' },
  { id: 'tide', background: 'rgb(10, 22, 34)' },
  { id: 'sunset', background: 'rgb(26, 16, 36)' },
  { id: 'gargantua', background: 'rgb(5, 6, 8)' },
]

test('applies and persists color themes', async ({ page }) => {
  await page.goto('/')
  const picker = page.getByLabel('Color theme')
  await expect(picker).toBeVisible()

  for (const theme of themes) {
    await picker.selectOption(theme.id)
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme.id)
    await expect(page.locator('body')).toHaveCSS('background-color', theme.background)
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

  await page.getByLabel('Color theme').selectOption('dune')
  const backdrop = page.locator('.canvas-backdrop')
  await expect(backdrop).toBeVisible()
  await expect(backdrop).toHaveAttribute('data-scene', 'dune-night')

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
