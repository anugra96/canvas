import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const authorization = { authorization: 'Bearer local-dev' }

function watchPageErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

async function importCanvas(
  request: APIRequestContext,
  title: string,
  canvas: { nodes: unknown[]; edges: unknown[] },
) {
  const response = await request.post('/v1/canvases/import', {
    headers: authorization,
    data: { title, canvas },
  })
  expect(response.ok()).toBe(true)
  return response.json() as Promise<{ id: string; title: string }>
}

async function createSystemsCanvas(request: APIRequestContext, title: string) {
  const response = await request.post('/v1/canvases', {
    headers: authorization,
    data: { title, profile: 'systems' },
  })
  expect(response.ok()).toBe(true)
  return response.json() as Promise<{ id: string; title: string }>
}

test('opens the list page and a canvas by deep link', async ({ page, request }) => {
  const errors = watchPageErrors(page)
  const canvas = await importCanvas(request, 'Production list', {
    nodes: [{ id: 'text-1', type: 'text', x: 0, y: 0, width: 360, height: 200, text: 'Hello' }],
    edges: [],
  })

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Canvases', exact: true })).toBeVisible()
  await page.goto(`/canvas/${canvas.id}`)
  await expect(page.locator('.canvas-flow')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Production list', level: 1 })).toBeVisible()
  expect(errors).toEqual([])
})

test('opens the Markdown editor and types', async ({ page, request }) => {
  const errors = watchPageErrors(page)
  const canvas = await importCanvas(request, 'Production text editing', {
    nodes: [{ id: 'text-1', type: 'text', x: 0, y: 0, width: 360, height: 200, text: 'Hello' }],
    edges: [],
  })

  await page.goto(`/canvas/${canvas.id}`)
  await page.locator('.text-node').dblclick()
  const editor = page.locator('.rich-editor-content')
  await expect(editor).toBeVisible()
  await editor.fill('Hello production')
  await page.keyboard.type(' build')
  await expect(editor).toContainText('Hello production build')
  expect(errors).toEqual([])
})

test('opens Views on a Systems canvas', async ({ page, request }) => {
  const errors = watchPageErrors(page)
  const canvas = await createSystemsCanvas(request, 'Production views')

  await page.goto(`/canvas/${canvas.id}`)
  await expect(page.locator('.profile-badge')).toHaveText('Systems')
  await page.getByRole('button', { name: 'Views', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Derived views' })).toBeVisible()
  expect(errors).toEqual([])
})

test('draws a scenic backdrop', async ({ page, request }) => {
  const errors = watchPageErrors(page)
  const canvas = await createSystemsCanvas(request, 'Production backdrop')

  await page.goto(`/canvas/${canvas.id}`)
  await expect(page.locator('.canvas-flow')).toBeVisible()
  await page.getByRole('button', { name: 'Appearance' }).click()
  await page.getByRole('radio', { name: 'Dune', exact: true }).click()
  const backdrop = page.locator('.canvas-backdrop')
  await expect(backdrop).toHaveAttribute('data-scene', 'dune-night')
  await expect.poll(async () => backdrop.locator('canvas').evaluate((element) => {
    const canvas = element as HTMLCanvasElement
    const context = canvas.getContext('2d')
    if (!context || canvas.width === 0 || canvas.height === 0) return false
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
    const colours = new Set<number>()
    let opaque = 0
    let sampled = 0
    for (let y = 0; y < canvas.height; y += 4) {
      for (let x = 0; x < canvas.width; x += 4) {
        const offset = (y * canvas.width + x) * 4
        const red = pixels[offset] ?? 0
        const green = pixels[offset + 1] ?? 0
        const blue = pixels[offset + 2] ?? 0
        const alpha = pixels[offset + 3] ?? 0
        if (alpha > 0) opaque += 1
        colours.add((red << 16) | (green << 8) | blue)
        sampled += 1
      }
    }
    return sampled > 0 && opaque / sampled > 0.5 && colours.size >= 8
  }), { timeout: 5_000 }).toBe(true)
  expect(errors).toEqual([])
})
