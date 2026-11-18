import { readFileSync } from 'node:fs'

import { expect, test, type Page } from '@playwright/test'

import { createCanvas } from './helpers'

const orderFixture = readFileSync(
  new URL('../../../packages/canvas-contract/src/database/fixtures/order-erd.sql', import.meta.url),
  'utf8',
)

async function createDatabaseCanvas(page: Page, name: string) {
  await page.goto('/')
  await page.getByLabel('Canvas type').selectOption('database')
  await createCanvas(page, name)
  await expect(page.locator('.canvas-flow')).toBeVisible()
}

async function dismissNotice(page: Page) {
  const dismiss = page.getByRole('button', { name: 'Dismiss', exact: true })
  if (await dismiss.count() > 0) await dismiss.first().click()
}

async function addTable(page: Page, name: string) {
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Table', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Add table' })
  await dialog.getByLabel('Table name').fill(name)
  await dialog.getByRole('button', { name: 'Add table', exact: true }).click()
  await expect(page.locator('.db-table-card').filter({ hasText: name })).toBeVisible()
  await dismissNotice(page)
}

async function exportDdl(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'More canvas actions' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: 'Export DDL' }).click()
  const download = await downloadPromise
  const path = await download.path()
  if (!path) throw new Error('Missing downloaded DDL file')
  return readFileSync(path, 'utf8')
}

test('imports DDL, adds a column, and exports it in the DDL', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))

  await page.goto('/')
  await expect(page.getByLabel('Canvas type').locator('option')).toHaveText([
    'Raw canvas',
    'Systems',
    'API',
    'Database',
  ])
  await page.getByRole('button', { name: 'Import DDL' }).click()
  const dialog = page.getByRole('dialog', { name: 'Import DDL' })
  await dialog.getByRole('textbox', { name: 'PostgreSQL DDL' }).fill(orderFixture)
  await dialog.getByRole('button', { name: 'Read DDL' }).click()
  await expect(dialog).toContainText('Tables3')
  await expect(dialog).toContainText('Enums1')
  await dialog.getByRole('button', { name: 'Create database canvas' }).click()

  await expect(page.locator('.canvas-flow')).toBeVisible()
  await expect(page.locator('.profile-badge')).toHaveText('Database')
  await expect(page.locator('.db-table-card')).toHaveCount(3)
  await expect(page.locator('.db-enum-card')).toHaveCount(1)
  await expect(page.locator('.db-schema-card')).toHaveCount(1)

  await page.locator('.react-flow__node')
    .filter({ has: page.locator('.db-table-card') })
    .filter({ hasText: 'order_item' })
    .first()
    .dblclick()
  const editor = page.getByRole('dialog', { name: 'Edit Table' })
  await expect(editor).toBeVisible()
  await editor.getByRole('button', { name: 'Add column' }).click()
  const row = editor.locator('.database-grid-row').last()
  await row.locator('input').nth(0).fill('rollup_note')
  await row.locator('input').nth(1).fill('text')
  await editor.getByRole('button', { name: 'Done' }).click()

  await page.getByRole('button', { name: 'More' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: 'Export DDL' }).click()
  const download = await downloadPromise
  const path = await download.path()
  if (!path) throw new Error('Missing downloaded DDL file')
  const ddl = readFileSync(path, 'utf8')
  expect(ddl).toContain('rollup_note text')

  expect(consoleErrors.filter((message) => /wasm|WebAssembly|compile/i.test(message))).toEqual([])
})

test('hand-designs a foreign key without losing the table columns', async ({ page }) => {
  await createDatabaseCanvas(page, 'Hand designed database')
  await addTable(page, 'parent')
  await addTable(page, 'child')

  await expect(page.locator('.db-table-card').filter({ hasText: 'parent' }).locator('.db-badge-pk'))
    .toHaveCount(1)
  await expect(page.locator('.db-table-card').filter({ hasText: 'child' }).locator('.db-badge-pk'))
    .toHaveCount(1)

  await page.locator('.db-table-card').filter({ hasText: 'child' }).dblclick()
  const editor = page.getByRole('dialog', { name: 'Edit Table' })
  await expect(editor).toBeVisible()
  await editor.getByRole('button', { name: 'Add foreign key' }).click()
  await editor.getByLabel('Foreign key 1 table').selectOption('public.parent')
  await editor.getByLabel('Foreign key 1 on delete').selectOption('cascade')
  await editor.getByRole('button', { name: 'Done' }).click()

  const childCard = page.locator('.db-table-card').filter({ hasText: 'child' })
  await expect(childCard).toContainText('id')
  await expect(childCard).toContainText('created_at')
  await expect(childCard.locator('.db-column-row')).toHaveCount(2)
  await expect(childCard.locator('.db-badge-fk')).toHaveCount(1)
  await expect(page.locator('.react-flow__edge')).toHaveCount(1)

  const ddl = await exportDdl(page)
  expect(ddl).toContain('FOREIGN KEY')
  expect(ddl).toContain('REFERENCES public.parent (id)')
  expect(ddl).toContain('ON DELETE CASCADE')
})

test('overlays editor notices without moving the canvas and dismisses them', async ({ page }) => {
  await createDatabaseCanvas(page, 'Notice overlay')
  const flow = page.locator('.canvas-flow')
  const before = await flow.boundingBox()
  if (!before) throw new Error('Missing canvas flow')

  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Table', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Add table' })
  await dialog.getByLabel('Table name').fill('notice_table')
  await dialog.getByRole('button', { name: 'Add table', exact: true }).click()

  const notice = page.locator('.editor-notice')
  await expect(notice).toContainText('Added table public.notice_table.')
  await expect(notice.getByRole('button', { name: 'Dismiss', exact: true })).toBeVisible()
  const after = await flow.boundingBox()
  if (!after) throw new Error('Missing canvas flow')
  expect(Math.abs(after.x - before.x)).toBeLessThan(1)
  expect(Math.abs(after.y - before.y)).toBeLessThan(1)
  expect(Math.abs(after.width - before.width)).toBeLessThan(1)
  expect(Math.abs(after.height - before.height)).toBeLessThan(1)

  await expect(notice).toHaveCount(0, { timeout: 6_500 })
})
