import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'

const orderFixture = readFileSync(
  new URL('../../../packages/canvas-contract/src/database/fixtures/order-erd.sql', import.meta.url),
  'utf8',
)

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
