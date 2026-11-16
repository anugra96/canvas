import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'

const engineFixture = readFileSync(
  new URL('../../../packages/canvas-contract/src/openapi/fixtures/skyward-engine-v1.json', import.meta.url),
  'utf8',
)

test('imports the Engine fixture into API cards with zero review errors', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByLabel('Canvas type').locator('option')).toHaveText(['Raw canvas', 'Systems', 'API'])
  await page.getByRole('button', { name: 'Import OpenAPI' }).click()
  const dialog = page.getByRole('dialog', { name: 'Import OpenAPI' })
  await dialog.getByLabel('OpenAPI 3.1 document').fill(engineFixture)
  await dialog.getByRole('button', { name: 'Read document' }).click()
  await expect(dialog).toContainText('Skyward Engine API')
  await expect(dialog).toContainText('Resources3')
  await expect(dialog).toContainText('Endpoints6')
  await expect(dialog).toContainText('Schemas20')
  await dialog.getByRole('button', { name: 'Create API canvas' }).click()

  await expect(page.locator('.canvas-flow')).toBeVisible()
  await expect(page.locator('.profile-badge')).toHaveText('API')
  await expect(page.locator('.entity-node')).toHaveCount(11)
  await expect(page.locator('.schema-node')).toHaveCount(20)
  for (const [type, count] of [['API', 1], ['Resource', 3], ['Endpoint', 6], ['Security', 1]] as const) {
    await expect(page.locator('.entity-type').filter({ hasText: new RegExp(`^${type}$`) })).toHaveCount(count)
  }

  await page.getByRole('button', { name: /^Review,/ }).click()
  const panel = page.locator('.review-panel')
  await expect(panel).toBeVisible()
  await expect(panel.locator('.validation-group.error')).toHaveCount(0)
  await expect(panel.locator('.validation-item.error')).toHaveCount(0)
  await expect(panel.locator('.validation-group.warning')).toHaveCount(1)
  await expect(panel.locator('.validation-group.warning').filter({ hasText: 'Schema review due' })).toContainText('20')
  await expect(panel.getByRole('tab', { name: /Issues/ })).toContainText('20')

  await panel.getByRole('button', { name: 'Close review' }).click()
  await page.getByRole('button', { name: 'Views', exact: true }).click()
  const views = page.getByRole('dialog', { name: 'Derived views' })
  await expect(views.getByRole('tab', { name: 'Reference' })).toHaveAttribute('aria-selected', 'true')
  await expect(views.locator('.api-reference-resource h3')).toHaveText(['healthz', 'jobs', 'products'])
  await expect(views.locator('.api-reference-endpoint')).toHaveCount(6)
})


test('opens the Endpoint inspector and raw operation tab', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Import OpenAPI' }).click()
  const dialog = page.getByRole('dialog', { name: 'Import OpenAPI' })
  await dialog.getByLabel('OpenAPI 3.1 document').fill(JSON.stringify({
    openapi: '3.1.0',
    info: { title: 'Inspector API', version: '1.0.0' },
    tags: [{ name: 'Jobs' }],
    paths: {
      '/v1/jobs/{job_id}': {
        get: {
          tags: ['Jobs'],
          operationId: 'getJob',
          parameters: [
            { name: 'job_id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Job' } },
        },
      },
    },
  }))
  await dialog.getByRole('button', { name: 'Read document' }).click()
  await dialog.getByRole('button', { name: 'Create API canvas' }).click()
  await expect(page.locator('.canvas-flow')).toBeVisible()

  await page.locator('.entity-node').filter({ hasText: '/v1/jobs/{job_id}' }).first().dblclick()
  const editor = page.getByRole('dialog', { name: 'Edit Endpoint' })
  await expect(editor.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true')
  await expect(editor.getByLabel('Method')).toHaveValue('GET')
  await expect(editor.getByLabel('Path')).toHaveValue('/v1/jobs/{job_id}')
  await expect(editor.getByRole('heading', { name: 'Parameters' })).toBeVisible()
  await expect(editor.getByRole('heading', { name: 'Responses' })).toBeVisible()
  await editor.getByRole('tab', { name: 'Raw' }).click()
  await expect(editor.getByLabel('Operation JSON')).toContainText('getJob')
})

test('creates and links an API canvas from a System card', async ({ page, request }) => {
  const response = await request.post('/v1/canvases/import', {
    headers: { authorization: 'Bearer local-dev' },
    data: {
      title: 'System API command',
      canvas: {
        nodes: [{
          id: 'system-1',
          type: 'text',
          x: 0,
          y: 0,
          width: 380,
          height: 260,
          text: '',
          app: {
            entityType: 'system',
            fields: {
              name: 'Engine API',
              purpose: '',
              kind: 'api',
              owner: '',
              deploymentUrl: '',
              status: 'active',
            },
          },
        }],
        edges: [],
        app: { profile: 'systems', profileVersion: 4 },
      },
    },
  })
  expect(response.ok()).toBe(true)
  const canvas = await response.json()
  await page.goto(`/canvas/${canvas.id}`)
  await expect(page.locator('.canvas-flow')).toBeVisible()
  await page.locator('.entity-node').dblclick()
  const editor = page.getByRole('dialog', { name: 'Edit System' })
  await editor.getByRole('button', { name: 'Create or open API canvas' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Created API canvas' })).toBeVisible()
  await expect(page.locator('.save-status')).toHaveText('Saved', { timeout: 5000 })
})
