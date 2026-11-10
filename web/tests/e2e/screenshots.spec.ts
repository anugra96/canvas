import { readFileSync } from 'node:fs'

import { expect, test, type Download } from '@playwright/test'
import { addCanvasItem, runCanvasCommand, createCanvas } from './helpers'

async function pngSize(download: Download): Promise<{ width: number; height: number; bytes: number }> {
  const path = await download.path()
  if (!path) throw new Error('Download path is unavailable.')
  const buffer = readFileSync(path)
  expect(buffer.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bytes: buffer.length,
  }
}

test('exports full-canvas and selected-area PNG screenshots', async ({ page }) => {
  await page.goto('/')
  await createCanvas(page)
  await page.locator('.canvas-flow').waitFor()
  await addCanvasItem(page, 'Text card')
  await page.locator('.node-text').waitFor()

  await runCanvasCommand(page, 'Screenshot')
  await expect(page.getByRole('dialog', { name: 'Screenshot canvas' })).toBeVisible()
  const fullDownloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Full canvas' }).click()
  const fullDownload = await fullDownloadPromise
  expect(fullDownload.suggestedFilename()).toMatch(/-full\.png$/)
  const full = await pngSize(fullDownload)
  expect(full.width).toBeGreaterThan(2000)
  expect(full.height).toBeGreaterThan(1000)
  expect(full.bytes).toBeGreaterThan(10_000)

  const flow = await page.locator('.canvas-flow').boundingBox()
  if (!flow) throw new Error('Missing canvas geometry')
  await runCanvasCommand(page, 'Screenshot')
  await page.getByRole('button', { name: 'Select area' }).click()
  await expect(page.locator('.screenshot-selection-layer')).toBeVisible()
  const selectionDownloadPromise = page.waitForEvent('download')
  await page.mouse.move(flow.x + 120, flow.y + 120)
  await page.mouse.down()
  await page.mouse.move(flow.x + 520, flow.y + 420, { steps: 10 })
  await page.mouse.up()
  const selectionDownload = await selectionDownloadPromise
  expect(selectionDownload.suggestedFilename()).toMatch(/-selection\.png$/)
  const selection = await pngSize(selectionDownload)
  expect(selection.width).toBeGreaterThan(2000)
  expect(selection.height).toBeGreaterThan(2000)
  expect(selection.bytes).toBeGreaterThan(10_000)
})
