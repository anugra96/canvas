import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'
import { parse as parseYaml } from 'yaml'

import { createCanvas } from './helpers'

const engineFixture = readFileSync(
  new URL('../../../packages/canvas-contract/src/openapi/fixtures/skyward-engine-v1.json', import.meta.url),
  'utf8',
)

test('imports the Engine fixture into API cards with zero review errors', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByLabel('Canvas type').locator('option')).toHaveText(['Raw canvas', 'Systems', 'API', 'Database'])
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
  for (const [selector, count] of [
    ['.api-definition-preview', 1],
    ['.api-resource-preview', 3],
    ['.api-endpoint-preview', 6],
    ['.api-security-preview', 1],
  ] as const) {
    await expect(page.locator(selector)).toHaveCount(count)
  }

  await page.getByRole('button', { name: /^Review,/ }).click()
  const panel = page.locator('.review-panel')
  await expect(panel).toBeVisible()
  await expect(panel.locator('.validation-group.error')).toHaveCount(0)
  await expect(panel.locator('.validation-item.error')).toHaveCount(0)
  await panel.getByLabel('Review mode').selectOption('Publish')
  await expect(panel.locator('.validation-group.warning')).toHaveCount(3)
  const reviewGroup = panel.locator('.validation-group.warning').filter({ hasText: 'Schema review due' })
  await expect(reviewGroup).toContainText('1')
  await reviewGroup.locator('.validation-group-toggle').click()
  await expect(reviewGroup.locator('.validation-item')).toContainText('API')
  await expect(reviewGroup.locator('.validation-item')).toContainText('Skyward Engine API')
  await expect(panel.getByRole('tab', { name: /Issues/ })).toContainText('8')

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
            { name: 'include', in: 'query', schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Job' } },
        },
      },
    },
  }))
  await dialog.getByRole('button', { name: 'Read document' }).click()
  await dialog.getByRole('button', { name: 'Create API canvas' }).click()
  await expect(page.locator('.canvas-flow')).toBeVisible()

  await page.locator('.entity-node').filter({ has: page.locator('.api-endpoint-preview') }).filter({ hasText: '/v1/jobs/{job_id}' }).first().dblclick()
  const editor = page.getByRole('dialog', { name: 'Edit Endpoint' })
  await expect(editor.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true')
  await expect(editor.getByLabel('Method')).toHaveValue('GET')
  await expect(editor.getByLabel('Path')).toHaveValue('/v1/jobs/{job_id}')
  await expect(editor.getByRole('heading', { name: 'Parameters' })).toBeVisible()
  await expect(editor.getByRole('heading', { name: 'Responses' })).toBeVisible()
  await expect(editor.getByLabel('Parameter 1 name', { exact: true })).toHaveValue('job_id')
  await expect(editor.getByLabel('Parameter 1 location', { exact: true })).toHaveValue('path')
  await expect(editor.getByLabel('Parameter 1 required', { exact: true })).toBeChecked()
  await expect(editor.getByLabel('Parameter 2 name', { exact: true })).toHaveValue('include')
  await editor.getByLabel('Parameter 2 name', { exact: true }).fill('expand')
  await editor.getByLabel('Parameter 2 location', { exact: true }).selectOption('query')
  await expect(editor.getByLabel('Parameter 2 required', { exact: true })).not.toBeChecked()
  await editor.getByLabel('Parameter 2 type', { exact: true }).selectOption('string')
  await editor.getByLabel('Parameter 2 format', { exact: true }).selectOption('uuid')
  await editor.getByLabel('Parameter 2 description', { exact: true }).fill('Expand related jobs')
  await expect(editor.getByLabel('Remove parameter 2', { exact: true })).toBeVisible()
  await editor.getByRole('tab', { name: 'Raw' }).click()
  await expect(editor.getByLabel('Operation JSON')).toContainText('getJob')
  await expect(editor.getByLabel('Operation JSON')).toContainText('expand')
  await expect(editor.getByLabel('Operation JSON')).toContainText('uuid')
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

test('draws an Endpoint to Schema relation through the managed chooser', async ({ page, request }) => {
  const response = await request.post('/v1/canvases/import', {
    headers: { authorization: 'Bearer local-dev' },
    data: {
      title: 'Managed edge chooser',
      canvas: {
        nodes: [
          {
            id: 'api', type: 'text', x: 0, y: 0, width: 420, height: 300, text: '',
            app: { entityType: 'api_definition', fields: { title: 'Chooser API', version: '1.0.0', status: 'active', extra: '{}' } },
          },
          {
            id: 'resource', type: 'text', x: 0, y: 360, width: 320, height: 200, text: '',
            app: { entityType: 'resource', fields: { name: 'Tasks' } },
          },
          {
            id: 'endpoint', type: 'text', x: 480, y: 0, width: 360, height: 220, text: '',
            app: {
              entityType: 'endpoint',
              fields: {
                method: 'POST',
                path: '/tasks',
                status: 'active',
                operation: JSON.stringify({ tags: ['Tasks'], responses: { '204': { description: 'Created' } } }, null, 2),
              },
            },
          },
          {
            id: 'schema', type: 'text', x: 1040, y: 0, width: 360, height: 240, text: '',
            app: {
              entityType: 'schema',
              fields: {
                name: 'TaskCreate',
                kind: 'api',
                version: '1.0.0',
                status: 'active',
                reviewStatus: 'approved',
                source: JSON.stringify({ type: 'object', properties: { title: { type: 'string' } }, required: ['title'] }, null, 2),
              },
            },
          },
        ],
        edges: [],
        app: { profile: 'api', profileVersion: 1 },
      },
    },
  })
  expect(response.ok()).toBe(true)
  const canvas = await response.json()
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto(`/canvas/${canvas.id}`)
  await expect(page.locator('.canvas-flow')).toBeVisible()
  await page.getByRole('button', { name: 'Fit View' }).click()
  await page.waitForTimeout(300)

  const endpoint = page.locator('.react-flow__node').filter({ has: page.locator('.api-endpoint-preview') }).first()
  const schema = page.locator('.react-flow__node').filter({ has: page.locator('.schema-node') }).first()
  const from = await endpoint.locator('.react-flow__handle-right').boundingBox()
  const to = await schema.locator('.react-flow__handle-left').boundingBox()
  if (!from || !to) throw new Error('Missing connection handles')
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 })
  await page.mouse.up()

  const chooser = page.getByRole('dialog', { name: 'Managed relation' })
  await expect(chooser).toBeVisible()
  await chooser.getByRole('button', { name: 'Request body' }).click()
  await expect(endpoint.locator('.api-preview-flow')).toContainText('body')
  await expect(endpoint.locator('.api-preview-flow')).toContainText('TaskCreate')
})

test('adds a resource, standard errors, and exports them as YAML', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Import OpenAPI' }).click()
  const importDialog = page.getByRole('dialog', { name: 'Import OpenAPI' })
  await importDialog.getByLabel('OpenAPI 3.1 document').fill(JSON.stringify({
    openapi: '3.1.0',
    info: { title: 'Projects API', version: '1.0.0' },
    servers: [{ url: 'https://api.example.com' }],
    components: {
      securitySchemes: {
        BearerAuth: { type: 'http', scheme: 'bearer', description: 'Bearer access' },
      },
    },
    security: [{ BearerAuth: [] }],
  }))
  await importDialog.getByRole('button', { name: 'Read document' }).click()
  await importDialog.getByRole('button', { name: 'Create API canvas' }).click()
  await expect(page.locator('.canvas-flow')).toBeVisible()
  await expect(page.locator('.api-security-preview')).toHaveCount(1)
  await expect(page.locator('.api-endpoint-preview')).toHaveCount(0)

  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Resource', exact: true }).click()
  const resourceDialog = page.getByRole('dialog', { name: 'Add resource' })
  await expect(resourceDialog.getByLabel('Path prefix')).toHaveValue('')
  await expect(resourceDialog.getByRole('button', { name: 'Add resource', exact: true })).toBeDisabled()
  await expect(resourceDialog.getByRole('status')).toContainText('Enter a singular name.')
  await resourceDialog.getByLabel('Singular').fill('project')
  await expect(resourceDialog.getByLabel('Plural')).toHaveValue('projects')
  await expect(resourceDialog.getByLabel('Id parameter')).toHaveValue('project_id')
  await expect(resourceDialog.getByRole('status')).toHaveCount(0)
  await resourceDialog.getByLabel('Path prefix').fill('/v1')
  await resourceDialog.getByRole('button', { name: 'Add resource', exact: true }).click()
  await expect(page.locator('.api-endpoint-preview')).toHaveCount(5)
  await expect(page.locator('.schema-node')).toHaveCount(4)
  await expect(page.locator('.api-resource-preview')).toHaveCount(1)

  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('menuitem', { name: 'Zoom to fit' }).click()
  await page.waitForTimeout(300)
  const securityBox = await page.locator('.react-flow__node').filter({ has: page.locator('.api-security-preview') }).boundingBox()
  const newCards = page.locator('.react-flow__node').filter({ has: page.locator('.api-endpoint-preview, .schema-node') })
  const newCardCount = await newCards.count()
  for (let index = 0; index < newCardCount; index += 1) {
    const box = await newCards.nth(index).boundingBox()
    if (!securityBox || !box) throw new Error('Missing card geometry')
    const overlaps = box.x < securityBox.x + securityBox.width
      && box.x + box.width > securityBox.x
      && box.y < securityBox.y + securityBox.height
      && box.y + box.height > securityBox.y
    expect(overlaps, `card ${index} overlaps Security`).toBe(false)
  }

  await page.locator('.canvas-flow').click({ position: { x: 20, y: 20 } })
  await page.keyboard.press('ControlOrMeta+A')
  await expect(page.locator('.react-flow__node.selected').first()).toBeVisible()
  await page.getByRole('button', { name: 'More' }).click()
  await page.getByRole('menuitem', { name: 'Standard errors' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'standard error' })).toBeVisible()

  await page.getByRole('button', { name: 'More' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: 'Export OpenAPI YAML' }).click()
  const download = await downloadPromise
  const path = await download.path()
  if (!path) throw new Error('Missing downloaded OpenAPI file')
  const yaml = readFileSync(path, 'utf8')
  expect(yaml).toContain('/v1/projects:')
  expect(yaml).toContain('/v1/projects/{project_id}:')
  expect(yaml).toContain('4XX:')
  expect(yaml).toContain('5XX:')
  expect(yaml).toContain('Problem')
  expect(yaml).toMatch(/^    Problem:$/m)
})

test('names endpoint cards with the method', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Canvas type').selectOption('api')
  await createCanvas(page, 'Method names')
  await expect(page.locator('.canvas-flow')).toBeVisible()

  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Resource', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Add resource' })
  await dialog.getByLabel('Singular').fill('task')
  await dialog.getByRole('button', { name: 'Add resource', exact: true }).click()

  await expect(page.locator('.api-endpoint-preview')).toHaveCount(5)
  await expect(page.getByRole('group', { name: 'Endpoint POST /tasks', exact: true })).toHaveCount(1)
  await expect(page.getByRole('group', { name: 'Endpoint DELETE /tasks/{task_id}', exact: true })).toHaveCount(1)
})

test('adds an endpoint only to an existing resource and exports it', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Import OpenAPI' }).click()
  const importDialog = page.getByRole('dialog', { name: 'Import OpenAPI' })
  await importDialog.getByLabel('OpenAPI 3.1 document').fill(JSON.stringify({
    openapi: '3.1.0',
    info: { title: 'Hand built endpoints', version: '1.0.0' },
    paths: {},
  }))
  await importDialog.getByRole('button', { name: 'Read document' }).click()
  await importDialog.getByRole('button', { name: 'Create API canvas' }).click()
  await expect(page.locator('.canvas-flow')).toBeVisible()

  await page.getByRole('button', { name: 'Add', exact: true }).click()
  const endpointItem = page.getByRole('menuitem', { name: 'Endpoint', exact: true })
  await expect(endpointItem).toBeDisabled()
  await expect(endpointItem).toContainText('Add a resource first')
  await page.keyboard.press('Escape')

  await expect(page.locator('.api-definition-preview')).toHaveCount(1)
  await page.locator('.react-flow__node').filter({ has: page.locator('.api-definition-preview') }).dblclick()
  const apiEditor = page.getByRole('dialog', { name: 'Edit API' })
  await expect(apiEditor).toContainText('Add a Security card first')
  await apiEditor.getByRole('button', { name: 'Done' }).click()

  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Resource', exact: true }).click()
  const resourceDialog = page.getByRole('dialog', { name: 'Add resource' })
  await resourceDialog.getByLabel('Singular').fill('task')
  await resourceDialog.getByRole('button', { name: 'Add resource', exact: true }).click()
  await expect(page.locator('.api-endpoint-preview')).toHaveCount(5)

  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Endpoint', exact: true }).click()
  const endpointDialog = page.getByRole('dialog', { name: 'Add endpoint' })
  const resourceSelect = endpointDialog.getByLabel('Resource', { exact: true })
  await expect(resourceSelect.locator('option')).toHaveText(['tasks'])
  const tasksId = await resourceSelect.locator('option').first().getAttribute('value')
  expect(tasksId).toBeTruthy()
  await expect(resourceSelect).toHaveValue(tasksId ?? '')
  await expect(endpointDialog.getByLabel('Path', { exact: true })).toHaveValue('/tasks')
  await endpointDialog.getByLabel('Method', { exact: true }).selectOption('GET')
  await endpointDialog.getByLabel('Path', { exact: true }).fill('/tasks/{task_id}/history')
  await endpointDialog.getByLabel('Summary', { exact: true }).fill('Task history')
  await endpointDialog.getByRole('button', { name: 'Add endpoint', exact: true }).click()

  const card = page.getByRole('group', { name: 'Endpoint GET /tasks/{task_id}/history', exact: true })
  await expect(card).toHaveCount(1)
  await expect(card).toContainText('Task history')
  await expect(card).not.toContainText('Endpoint data unavailable')

  await page.getByRole('button', { name: 'More' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: 'Export OpenAPI YAML' }).click()
  const download = await downloadPromise
  const path = await download.path()
  if (!path) throw new Error('Missing downloaded OpenAPI file')
  const document = parseYaml(readFileSync(path, 'utf8')) as {
    paths?: Record<string, { get?: { tags?: string[]; summary?: string } }>
  }
  expect(document.paths?.['/tasks/{task_id}/history']?.get?.tags).toEqual(['tasks'])
  expect(document.paths?.['/tasks/{task_id}/history']?.get?.summary).toBe('Task history')
})

test('sets API-wide default security from the API form', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Import OpenAPI' }).click()
  const importDialog = page.getByRole('dialog', { name: 'Import OpenAPI' })
  await importDialog.getByLabel('OpenAPI 3.1 document').fill(`openapi: 3.1.0
info:
  title: Secure API
  version: 1.0.0
components:
  securitySchemes:
    BearerAuth:
      type: http
      scheme: bearer
paths: {}
`)
  await importDialog.getByRole('button', { name: 'Read document' }).click()
  await importDialog.getByRole('button', { name: 'Create API canvas' }).click()
  await expect(page.locator('.canvas-flow')).toBeVisible()

  await page.locator('.react-flow__node').filter({ has: page.locator('.api-definition-preview') }).dblclick()
  const editor = page.getByRole('dialog', { name: 'Edit API' })
  const checkbox = editor.getByLabel('Default security BearerAuth', { exact: true })
  await expect(checkbox).not.toBeChecked()
  await checkbox.check()
  await editor.getByRole('button', { name: 'Done' }).click()

  await page.getByRole('button', { name: 'More' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: 'Export OpenAPI YAML' }).click()
  const download = await downloadPromise
  const path = await download.path()
  if (!path) throw new Error('Missing downloaded OpenAPI file')
  const document = parseYaml(readFileSync(path, 'utf8')) as { security?: unknown }
  expect(document.security).toEqual([{ BearerAuth: [] }])

  await page.locator('.react-flow__node').filter({ has: page.locator('.api-definition-preview') }).dblclick()
  const reopened = page.getByRole('dialog', { name: 'Edit API' })
  await reopened.getByLabel('Default security BearerAuth', { exact: true }).uncheck()
  await reopened.getByRole('button', { name: 'Done' }).click()

  await page.getByRole('button', { name: 'More' }).click()
  const secondDownloadPromise = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: 'Export OpenAPI YAML' }).click()
  const secondDownload = await secondDownloadPromise
  const secondPath = await secondDownload.path()
  if (!secondPath) throw new Error('Missing downloaded OpenAPI file')
  const secondDocument = parseYaml(readFileSync(secondPath, 'utf8')) as { security?: unknown }
  expect(secondDocument.security).toBeUndefined()
})

test('edits a Resource lane title and description', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Import OpenAPI' }).click()
  const importDialog = page.getByRole('dialog', { name: 'Import OpenAPI' })
  await importDialog.getByLabel('OpenAPI 3.1 document').fill(JSON.stringify({
    openapi: '3.1.0',
    info: { title: 'Hand built API', version: '1.0.0' },
    paths: {},
  }))
  await importDialog.getByRole('button', { name: 'Read document' }).click()
  await importDialog.getByRole('button', { name: 'Create API canvas' }).click()
  await expect(page.locator('.canvas-flow')).toBeVisible()

  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Resource', exact: true }).click()
  const addDialog = page.getByRole('dialog', { name: 'Add resource' })
  await addDialog.getByLabel('Singular').fill('task')
  await addDialog.getByRole('button', { name: 'Add resource', exact: true }).click()

  const lane = page.getByRole('group', { name: 'Resource tasks', exact: true })
  await expect(lane).toBeVisible()
  await page.waitForTimeout(500)
  await lane.locator('header strong').dblclick()
  const editor = page.getByRole('dialog', { name: 'Edit Resource' })
  await expect(editor).toBeVisible()
  await editor.getByLabel('Name', { exact: true }).fill('Tasks')
  await editor.getByLabel('Description', { exact: true }).fill('Create, inspect, update, and remove tasks.')
  await editor.getByRole('button', { name: 'Done' }).click()

  await page.keyboard.press('Enter')
  await expect(editor).toBeVisible()
  await editor.getByRole('button', { name: 'Done' }).click()

  await page.getByRole('button', { name: 'More' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: 'Export OpenAPI YAML' }).click()
  const download = await downloadPromise
  const path = await download.path()
  if (!path) throw new Error('Missing downloaded OpenAPI file')
  const document = parseYaml(readFileSync(path, 'utf8')) as {
    tags?: Array<{ name?: string; description?: string }>
    paths?: Record<string, Record<string, { tags?: string[] }>>
  }
  expect(document.tags).toEqual([{
    name: 'Tasks',
    description: 'Create, inspect, update, and remove tasks.',
  }])
  const tags = Object.values(document.paths ?? {}).flatMap((pathItem) => (
    Object.values(pathItem).map((operation) => operation.tags)
  ))
  expect(tags.length).toBeGreaterThan(0)
  for (const tag of tags) expect(tag).toEqual(['Tasks'])
})

test('opens field details by field name and exports maxLength', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Import OpenAPI' }).click()
  const importDialog = page.getByRole('dialog', { name: 'Import OpenAPI' })
  await importDialog.getByLabel('OpenAPI 3.1 document').fill(JSON.stringify({
    openapi: '3.1.0',
    info: { title: 'Details API', version: '1.0.0' },
    tags: [{ name: 'Tasks' }],
    paths: {
      '/tasks': {
        get: { tags: ['Tasks'], responses: { '200': { description: 'OK' } } },
      },
    },
    components: {
      schemas: {
        Task: {
          type: 'object',
          properties: { title: { type: 'string' } },
        },
      },
    },
  }))
  await importDialog.getByRole('button', { name: 'Read document' }).click()
  await importDialog.getByRole('button', { name: 'Create API canvas' }).click()
  await expect(page.locator('.canvas-flow')).toBeVisible()

  await page.locator('.schema-node').dblclick()
  const editor = page.getByRole('dialog', { name: 'Edit schema contract' })
  await editor.getByRole('tab', { name: 'Fields' }).click()
  await expect(editor.getByRole('button', { name: 'Details title', exact: true })).toBeVisible()
  await editor.getByRole('button', { name: 'Details title', exact: true }).click()
  await editor.getByLabel('Max length', { exact: true }).fill('120')
  await editor.getByRole('button', { name: 'Done' }).click()

  await page.getByRole('button', { name: 'More' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: 'Export OpenAPI YAML' }).click()
  const download = await downloadPromise
  const path = await download.path()
  if (!path) throw new Error('Missing downloaded OpenAPI file')
  const document = parseYaml(readFileSync(path, 'utf8')) as {
    components?: { schemas?: { Task?: { properties?: { title?: { maxLength?: number } } } } }
  }
  expect(document.components?.schemas?.Task?.properties?.title?.maxLength).toBe(120)
})
