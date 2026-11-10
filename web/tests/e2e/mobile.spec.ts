import { devices, expect, test } from '@playwright/test'
import { createCanvas } from './helpers'

test.use({ ...devices['iPhone 13'], defaultBrowserType: 'chromium' })

test('keeps the mobile shell, editor, and card editing usable', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'New canvas' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)

  await createCanvas(page)
  await page.waitForSelector('.canvas-flow')

  const toolbar = await page.locator('.mobile-toolbar').boundingBox()
  const flow = await page.locator('.canvas-flow').boundingBox()
  expect(toolbar?.height ?? 999).toBeLessThan(80)
  expect(flow?.height ?? 0).toBeGreaterThan(400)

  await page.getByRole('button', { name: 'Add card' }).click()
  const card = page.locator('.node-text')
  await expect(card).toBeVisible()
  await expect(page.locator('.react-flow__controls')).toBeHidden()
  const rightHandle = page.locator('.react-flow__handle-right').first()
  await expect(rightHandle).toHaveCSS('pointer-events', 'none')
  await page.getByRole('button', { name: 'Connect' }).click()
  await expect(page.getByRole('button', { name: 'Tap a card' })).toBeVisible()
  await expect(rightHandle).toHaveCSS('pointer-events', 'none')
  await page.getByRole('button', { name: 'Tap a card' }).click()
  await expect(page.getByRole('button', { name: 'Connect' })).toBeVisible()
  await page.getByRole('button', { name: 'Size' }).click()
  await expect(page.getByRole('dialog', { name: 'Resize card' })).toBeVisible()
  await page.getByLabel('Width').fill('420')
  await page.getByLabel('Height').fill('240')
  await page.getByRole('button', { name: 'Apply size' }).click()
  await expect(page.locator('.react-flow__node').first()).toHaveCSS('width', '420px')
  await page.getByRole('button', { name: 'Clear selection' }).click()
  await expect(page.locator('.react-flow__node.selected')).toHaveCount(0)

  const cardBox = await card.boundingBox()
  if (!cardBox) throw new Error('Missing card geometry')
  await page.touchscreen.tap(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2)
  await page.waitForTimeout(80)
  await page.touchscreen.tap(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2)
  await expect(page.getByRole('dialog', { name: 'Edit text card' })).toBeVisible()
  const done = await page.getByRole('button', { name: 'Done' }).boundingBox()
  if (!done) throw new Error('Missing Done button geometry')
  await page.touchscreen.tap(done.x + done.width / 2, done.y + done.height / 2)

  await page.getByRole('button', { name: 'More editor actions' }).click()
  await expect(page.getByRole('dialog', { name: 'Editor actions' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Screenshot' })).toBeVisible()
  await page.getByLabel('Add template').selectOption('repository')
  await expect(page.locator('.entity-node')).toBeVisible()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()

  const beforePan = await page.locator('.react-flow__viewport').getAttribute('style')
  await page.mouse.move((flow?.x ?? 0) + 240, (flow?.y ?? 0) + 120)
  await page.mouse.down()
  await page.mouse.move((flow?.x ?? 0) + 320, (flow?.y ?? 0) + 200, { steps: 8 })
  await page.mouse.up()
  await expect(page.locator('.react-flow__viewport')).not.toHaveAttribute('style', beforePan ?? '')

  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
})


test('connects two cards by tapping in touch connect mode', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(async () => {
    const response = await fetch('/v1/canvases/import', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer local-dev',
      },
      body: JSON.stringify({
        title: 'Touch connect test',
        canvas: {
          nodes: [
            { id: 'a', type: 'text', x: 0, y: 0, width: 240, height: 120, text: 'A' },
            { id: 'b', type: 'text', x: 600, y: 0, width: 240, height: 120, text: 'B' },
          ],
          edges: [],
        },
      }),
    })
    if (!response.ok) throw new Error('Could not seed the touch canvas.')
  })
  await page.reload()
  await page.getByRole('heading', { name: 'Touch connect test' }).click()
  await page.locator('.canvas-flow').waitFor()
  await page.waitForTimeout(500)

  const cards = page.locator('.canvas-node')
  const first = await cards.nth(0).boundingBox()
  const second = await cards.nth(1).boundingBox()
  if (!first || !second) throw new Error('Missing card geometry')

  await page.touchscreen.tap(first.x + first.width / 2, first.y + first.height / 2)
  await page.getByRole('button', { name: 'Connect' }).click()
  await expect(page.getByRole('button', { name: 'Tap a card' })).toBeVisible()
  await page.touchscreen.tap(second.x + second.width / 2, second.y + second.height / 2)

  await expect(page.locator('.react-flow__edge')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Tap a card' })).toHaveCount(0)
})
