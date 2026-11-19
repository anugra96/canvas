import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { parse } from 'yaml'

// Reference for skills/canvas-ui: builds the core of examples/simple-tasks-api.yaml entirely through the UI.
// Run against an isolated app (see SKILL.md) with a Playwright config whose baseURL is that app.
// Output: <CANVAS_UI_OUT or test-results>/simple-tasks-api.yaml

const card = (page: Page, name: string): Locator => page.getByRole('group', { name, exact: true })

async function addFromMenu(page: Page, item: string) {
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('menuitem', { name: item, exact: true }).click()
}

async function openCard(page: Page, name: string) {
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Fit View', exact: true }).click()
  await card(page, name).dblclick()
}

async function moreAction(page: Page, item: string) {
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'More canvas actions', exact: true }).click()
  await page.getByRole('menuitem', { name: item }).click()
}

test('build Simple Tasks API by hand', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New canvas', exact: true }).waitFor()
  await page.getByLabel('Canvas type').selectOption('api')
  await page.getByRole('button', { name: 'New canvas', exact: true }).click()
  await page.getByRole('dialog').getByLabel('Canvas name').fill('Simple Tasks API (hand-built)')
  await page.getByRole('dialog').getByRole('button', { name: 'Create canvas', exact: true }).click()
  await expect(page).toHaveURL(/\/canvas\//)

  // 1. API card: one per canvas.
  await addFromMenu(page, 'API')
  await page.locator('.react-flow__node.selected').last().dblclick()
  let ed = page.getByRole('dialog', { name: 'Edit API', exact: true })
  await ed.getByLabel('Title', { exact: true }).fill('Simple Tasks API')
  await ed.getByLabel('Version', { exact: true }).fill('1.0.0')
  await ed.getByLabel('Description', { exact: true }).fill('A small task tracker API.')
  await ed.getByLabel('Server 1', { exact: true }).fill('https://api.example.test/v1')
  await ed.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(card(page, 'API Simple Tasks API')).toBeVisible()

  // 2. Security scheme, then make it the API default.
  await addFromMenu(page, 'Security')
  await page.locator('.react-flow__node.selected').last().dblclick()
  ed = page.getByRole('dialog', { name: 'Edit Security', exact: true })
  await ed.getByLabel('Name', { exact: true }).fill('BearerAuth')
  await ed.getByRole('combobox', { name: 'Type', exact: true }).selectOption('http')
  await ed.getByRole('combobox', { name: 'Scheme', exact: true }).selectOption('bearer')
  await ed.getByLabel('Bearer format', { exact: true }).fill('JWT')
  await ed.getByLabel('Description', { exact: true }).fill('Send a bearer token in the Authorization header.')
  await ed.getByRole('button', { name: 'Done', exact: true }).click()

  await openCard(page, 'API Simple Tasks API')
  ed = page.getByRole('dialog', { name: 'Edit API', exact: true })
  await ed.getByLabel('Default security BearerAuth', { exact: true }).check()
  await ed.getByRole('button', { name: 'Done', exact: true }).click()

  // 3. Resource: scaffolds list/create/get/update/delete endpoints and four schemas.
  await addFromMenu(page, 'Resource')
  const add = page.getByRole('dialog', { name: 'Add resource' })
  await add.getByLabel('Singular', { exact: true }).fill('task')
  await add.getByRole('button', { name: 'Add resource', exact: true }).click()
  await expect(card(page, 'Endpoint POST /tasks')).toBeVisible()

  // The resource is the OpenAPI tag: rename it from its lane title.
  await page.getByRole('button', { name: 'Fit View', exact: true }).click()
  await card(page, 'Resource tasks').locator('header strong').dblclick()
  ed = page.getByRole('dialog', { name: 'Edit Resource', exact: true })
  await ed.getByLabel('Name', { exact: true }).fill('Tasks')
  await ed.getByLabel('Description', { exact: true }).fill('Create, inspect, update, and remove tasks.')
  await ed.getByRole('button', { name: 'Done', exact: true }).click()

  // 4. Task schema. Row labels follow the field name: after renaming, press Tab and use the new name.
  await openCard(page, 'Schema Task')
  ed = page.getByRole('dialog', { name: 'Edit schema contract', exact: true })
  const rename = async (from: string, to: string) => {
    await ed.getByLabel(`Field name ${from}`, { exact: true }).fill(to)
    await page.keyboard.press('Tab')
  }
  // Details is a toggle and several panels can be open: open one, edit, close it again.
  const details = async (field: string, edit: () => Promise<void>) => {
    const toggle = ed.getByRole('button', { name: `Details ${field}`, exact: true })
    await toggle.click()
    await edit()
    await toggle.click()
  }
  const format = (value: string) => () => ed.getByRole('combobox', { name: 'Format', exact: true }).selectOption(value).then(() => undefined)
  await rename('name', 'title')
  await details('title', async () => {
    await ed.getByLabel('Min length', { exact: true }).fill('1')
    await ed.getByLabel('Max length', { exact: true }).fill('120')
  })
  await details('id', format('uuid'))
  await rename('created_at', 'createdAt')
  await details('createdAt', format('date-time'))
  await ed.getByRole('button', { name: 'Delete updated_at', exact: true }).click()
  await ed.getByRole('button', { name: 'Add field', exact: true }).click()
  await rename('field', 'status')
  await ed.getByRole('combobox', { name: 'Field type status', exact: true }).selectOption('enum')
  await details('status', () => ed.getByLabel('Enum values', { exact: true }).fill('open\nin_progress\ndone'))
  await ed.getByRole('button', { name: 'Add field', exact: true }).click()
  await rename('field', 'dueDate')
  await ed.getByLabel('Required dueDate', { exact: true }).uncheck()
  await details('dueDate', format('date'))
  await ed.getByRole('button', { name: 'Done', exact: true }).click()

  // 5. Endpoint details: parameters are numbered rows.
  await openCard(page, 'Endpoint GET /tasks')
  ed = page.getByRole('dialog', { name: 'Edit Endpoint', exact: true })
  await ed.getByLabel('Parameter 1 description', { exact: true }).fill('Maximum number of tasks to return.')
  await ed.getByLabel('Parameter 2 description', { exact: true }).fill('Opaque cursor from the previous page.')
  await ed.getByRole('button', { name: 'Done', exact: true }).click()

  // 6. One more endpoint in the same resource.
  await addFromMenu(page, 'Endpoint')
  const addEndpoint = page.getByRole('dialog', { name: 'Add endpoint' })
  await addEndpoint.getByRole('combobox', { name: 'Method', exact: true }).selectOption('GET')
  await addEndpoint.getByLabel('Path', { exact: true }).fill('/tasks/{task_id}/history')
  await addEndpoint.getByLabel('Summary', { exact: true }).fill('List task history')
  await addEndpoint.getByRole('button', { name: 'Add endpoint', exact: true }).click()
  await expect(card(page, 'Endpoint GET /tasks/{task_id}/history')).toBeVisible()

  // 7. Standard error responses on the selected endpoints (Shift-click adds to the selection).
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Fit View', exact: true }).click()
  const endpoints = ['Endpoint GET /tasks', 'Endpoint POST /tasks', 'Endpoint GET /tasks/{task_id}', 'Endpoint PATCH /tasks/{task_id}', 'Endpoint DELETE /tasks/{task_id}']
  for (const [index, name] of endpoints.entries()) await card(page, name).click(index === 0 ? undefined : { modifiers: ['Shift'] })
  await page.getByRole('button', { name: 'More canvas actions', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Standard errors' }).click()

  // 8. Tidy and export.
  await moreAction(page, 'Tidy API layout')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'More canvas actions', exact: true }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: 'Export OpenAPI YAML' }).click()
  const out = join(process.env.CANVAS_UI_OUT ?? test.info().outputDir, 'simple-tasks-api.yaml')
  await (await download).saveAs(out)

  const spec = parse(readFileSync(out, 'utf8'))
  expect(spec.info).toMatchObject({ title: 'Simple Tasks API', version: '1.0.0' })
  expect(spec.servers).toEqual([{ url: 'https://api.example.test/v1' }])
  expect(spec.security).toEqual([{ BearerAuth: [] }])
  expect(spec.components.securitySchemes.BearerAuth).toMatchObject({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
  expect(spec.tags).toContainEqual({ name: 'Tasks', description: 'Create, inspect, update, and remove tasks.' })
  expect(Object.keys(spec.paths).sort()).toEqual(['/tasks', '/tasks/{task_id}', '/tasks/{task_id}/history'])
  expect(Object.keys(spec.paths['/tasks']).sort()).toEqual(['get', 'post'])
  const task = spec.components.schemas.Task
  expect(task.properties.title).toMatchObject({ type: 'string', minLength: 1, maxLength: 120 })
  expect(task.properties.status.enum).toEqual(['open', 'in_progress', 'done'])
  expect(task.properties.dueDate).toMatchObject({ type: 'string', format: 'date' })
  expect(task.required).not.toContain('dueDate')
})
