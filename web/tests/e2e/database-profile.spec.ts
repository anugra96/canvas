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

async function addTable(page: Page, name: string, schema?: string) {
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Table', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Add table' })
  await dialog.getByLabel('Table name').fill(name)
  if (schema) await dialog.getByLabel('Schema').fill(schema)
  await dialog.getByRole('button', { name: 'Add table', exact: true }).click()
  await expect(page.locator('.db-table-card').filter({ hasText: name })).toBeVisible()
  await dismissNotice(page)
}

async function choosePostgresTarget(page: Page) {
  await page.getByRole('button', { name: 'More canvas actions' }).click()
  await page.getByRole('menuitem', { name: 'Database settings', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Database settings' })
  await dialog.getByRole('combobox', { name: 'Target', exact: true }).selectOption('postgres')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(dialog).toBeHidden()
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
  await editor.getByRole('button', { name: 'Add column', exact: true }).first().click()
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

  await page.goto('/')
  await page.getByLabel('Canvas type').selectOption('database')
  await createCanvas(page, 'Empty DDL import')
  const emptyPanel = page.getByRole('region', { name: 'Design a database' })
  await expect(emptyPanel).toBeVisible()
  await page.getByRole('button', { name: 'Import DDL', exact: true }).click()
  const emptyImport = page.getByRole('dialog', { name: 'Import DDL' })
  await emptyImport.getByRole('textbox', { name: 'PostgreSQL DDL' }).fill(orderFixture)
  await emptyImport.getByRole('button', { name: 'Read DDL' }).click()
  await expect(emptyImport).toContainText('Tables3')
  await emptyImport.getByRole('button', { name: 'Import into canvas' }).click()
  await expect(page.getByRole('group', { name: /^Table public\./ })).toHaveCount(3)
  const undo = page.getByRole('button', { name: 'Undo', exact: true })
  await expect(undo).toBeEnabled()
  await undo.click()
  await expect(page.getByRole('group', { name: /^Table public\./ })).toHaveCount(0)
  await expect(emptyPanel).toBeVisible()
})

test('guides a first database design from the empty canvas to table editing', async ({ page }) => {
  await createDatabaseCanvas(page, 'First use database')
  const panel = page.getByRole('region', { name: 'Design a database' })
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('heading', { name: 'Design a database', exact: true }))
    .toBeVisible()
  await expect(panel).toContainText('Choose a target later in Database settings.')
  await expect(panel).toContainText('Tables hold columns, keys, and indexes. Double-click a table to edit it.')
  await expect(panel.getByRole('button', { name: 'Add enum', exact: true })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Import DDL', exact: true })).toBeVisible()

  const cardCount = await page.locator('.react-flow__node').count()
  await page.getByRole('button', { name: 'More canvas actions' }).click()
  const exportItem = page.getByRole('menuitem', { name: 'Export DDL', exact: true })
  await expect(exportItem).toBeDisabled()
  await expect(exportItem).toContainText('Choose a target in Database settings')
  const copyItem = page.getByRole('menuitem', { name: 'Copy DDL', exact: true })
  await expect(copyItem).toBeDisabled()
  await expect(copyItem).toContainText('Choose a target in Database settings')
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'More canvas actions' }).click()
  await page.getByRole('menuitem', { name: 'Database settings', exact: true }).click()
  const databaseSettings = page.getByRole('dialog', { name: 'Database settings' })
  await expect(databaseSettings).toBeVisible()
  await expect(databaseSettings.getByRole('combobox', { name: 'Target', exact: true })).toHaveValue('')
  await databaseSettings.getByLabel('Name', { exact: true }).fill('first_use_db')
  await databaseSettings.getByLabel('Extensions', { exact: true }).fill('pgcrypto public')
  await databaseSettings.getByRole('combobox', { name: 'Target', exact: true }).selectOption('postgres')
  await databaseSettings.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(databaseSettings).toBeHidden()
  await expect(page.getByRole('status', { name: 'Saved', exact: true })).toBeVisible()
  await expect(page.locator('.react-flow__node')).toHaveCount(cardCount)
  await expect(panel).toBeVisible()

  await page.reload()
  await expect(panel).toBeVisible()
  await page.getByRole('button', { name: 'More canvas actions' }).click()
  await page.getByRole('menuitem', { name: 'Database settings', exact: true }).click()
  await expect(databaseSettings.getByLabel('Name', { exact: true })).toHaveValue('first_use_db')
  await expect(databaseSettings.getByRole('combobox', { name: 'Target', exact: true })).toHaveValue('postgres')
  await databaseSettings.getByLabel('Name', { exact: true }).fill('discarded name')
  await databaseSettings.getByRole('combobox', { name: 'Target', exact: true }).selectOption('')
  await page.keyboard.press('Escape')
  await expect(databaseSettings).toBeHidden()
  await page.getByRole('button', { name: 'More canvas actions' }).click()
  await page.getByRole('menuitem', { name: 'Database settings', exact: true }).click()
  await expect(databaseSettings.getByLabel('Name', { exact: true })).toHaveValue('first_use_db')
  await expect(databaseSettings.getByRole('combobox', { name: 'Target', exact: true })).toHaveValue('postgres')
  await databaseSettings.getByLabel('Name', { exact: true }).fill('discarded name')
  await databaseSettings.getByRole('combobox', { name: 'Target', exact: true }).selectOption('')
  await databaseSettings.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(databaseSettings).toBeHidden()
  await page.getByRole('button', { name: 'More canvas actions' }).click()
  await page.getByRole('menuitem', { name: 'Database settings', exact: true }).click()
  await expect(databaseSettings.getByLabel('Name', { exact: true })).toHaveValue('first_use_db')
  await expect(databaseSettings.getByRole('combobox', { name: 'Target', exact: true })).toHaveValue('postgres')
  await databaseSettings.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(databaseSettings).toBeHidden()

  const ddl = await exportDdl(page)
  expect(ddl).toContain('CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;')

  await panel.getByRole('button', { name: 'Add table', exact: true }).click()
  const addTableDialog = page.getByRole('dialog', { name: 'Add table' })
  await addTableDialog.getByLabel('Table name').fill('orders')
  await addTableDialog.getByRole('button', { name: 'Add table', exact: true }).click()
  await expect(panel).toBeHidden()

  const table = page.getByRole('group', { name: 'Table public.orders', exact: true })
  await expect(table).toBeVisible()
  const hint = table.getByText('Double-click to edit columns', { exact: true })
  await expect(hint).toBeVisible()

  await table.dblclick()
  const editor = page.getByRole('dialog', { name: 'Edit Table' })
  await expect(editor).toBeVisible()
  const addColumn = editor.getByRole('button', { name: 'Add column', exact: true }).last()
  const addColumnBox = await addColumn.boundingBox()
  const editorBox = await editor.boundingBox()
  const viewport = page.viewportSize()
  if (!addColumnBox || !editorBox || !viewport) throw new Error('Missing Add column or dialog bounds')
  expect(addColumnBox.x).toBeGreaterThanOrEqual(editorBox.x)
  expect(addColumnBox.y).toBeGreaterThanOrEqual(editorBox.y)
  expect(addColumnBox.x + addColumnBox.width).toBeLessThanOrEqual(editorBox.x + editorBox.width)
  expect(addColumnBox.y + addColumnBox.height).toBeLessThanOrEqual(editorBox.y + editorBox.height)
  expect(addColumnBox.x + addColumnBox.width).toBeLessThanOrEqual(viewport.width)
  expect(addColumnBox.y + addColumnBox.height).toBeLessThanOrEqual(viewport.height)
  await addColumn.click()
  await expect(editor.getByLabel('Column 3 name', { exact: true })).toBeFocused()
  // Typing a whole name keeps focus: a row must not remount when its name changes (key was the name).
  await page.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+a`)
  await page.keyboard.type('total_cents')
  await expect(editor.getByLabel('Column 3 name', { exact: true })).toHaveValue('total_cents')
  await expect(editor.getByLabel('Column 3 name', { exact: true })).toBeFocused()
  await editor.getByLabel('Column 3 name', { exact: true }).fill('status')
  await editor.getByLabel('Column 3 type', { exact: true }).fill('text')
  await editor.getByRole('button', { name: 'Done' }).click()
  await expect(hint).toHaveCount(0)

  await page.getByRole('button', { name: 'Add', exact: true }).click()
  const addMenu = page.getByRole('menu', { name: 'Add commands' })
  const addLabels = await addMenu.getByRole('menuitem').evaluateAll((items) => (
    items.map((item) => item.getAttribute('aria-label'))
  ))
  expect(addLabels).toEqual(['Table', 'Enum', 'Schema (namespace)', 'Note'])
  await page.keyboard.press('Escape')

  const lane = page.getByRole('group', { name: 'Schema public', exact: true })
  await expect(lane).toBeVisible()
  await lane.getByRole('button', { name: 'Add table here', exact: true }).click()
  const laneDialog = page.getByRole('dialog', { name: 'Add table' })
  await expect(laneDialog.getByLabel('Schema', { exact: true })).toHaveValue('public')
  await laneDialog.getByRole('button', { name: 'Cancel', exact: true }).click()
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

  await choosePostgresTarget(page)
  const ddl = await exportDdl(page)
  expect(ddl).toContain('FOREIGN KEY')
  expect(ddl).toContain('REFERENCES public.parent (id)')
  expect(ddl).toContain('ON DELETE CASCADE')
})

test('clears a starter column default without exporting an empty DEFAULT', async ({ page }) => {
  await createDatabaseCanvas(page, 'Cleared default')
  await addTable(page, 'account')

  await page.locator('.db-table-card').filter({ hasText: 'account' }).dblclick()
  const editor = page.getByRole('dialog', { name: 'Edit Table' })
  await expect(editor.getByLabel('Column 1 default')).toHaveValue('gen_random_uuid()')
  await editor.getByLabel('Column 1 default').fill('')
  await editor.getByRole('button', { name: 'Add column', exact: true }).last().click()
  await page.keyboard.type('seen_at')
  await editor.getByLabel(/^Column \d+ type$/).last().fill('timestamp')
  await editor.getByRole('button', { name: 'Done' }).click()

  await choosePostgresTarget(page)
  const ddl = await exportDdl(page)
  expect(ddl).toContain('id uuid NOT NULL')
  expect(ddl).not.toContain('DEFAULT  ')
  // The target chosen in this session (no reload) maps neutral timestamp for PostgreSQL.
  expect(ddl).toContain('seen_at timestamp with time zone')
})

test('adds a named composite unique constraint from the table form', async ({ page }) => {
  await createDatabaseCanvas(page, 'Composite unique')
  await addTable(page, 'workspace_member')

  await page.locator('.db-table-card').filter({ hasText: 'workspace_member' }).dblclick()
  const editor = page.getByRole('dialog', { name: 'Edit Table' })

  await editor.getByRole('button', { name: 'Add column', exact: true }).first().click()
  let row = editor.locator('.database-grid-row').last()
  await row.locator('input').nth(0).fill('workspace_id')
  await editor.getByRole('button', { name: 'Add column', exact: true }).first().click()
  row = editor.locator('.database-grid-row').last()
  await row.locator('input').nth(0).fill('name')

  await editor.getByRole('button', { name: 'Add unique' }).click()
  await editor.getByLabel('Unique 1 name').fill('workspace_member_workspace_name_key')
  await editor.getByLabel('Unique 1 columns').fill('workspace_id, name')
  await editor.getByRole('button', { name: 'Done' }).click()

  await choosePostgresTarget(page)
  const ddl = await exportDdl(page)
  expect(ddl).toContain('CONSTRAINT workspace_member_workspace_name_key UNIQUE (workspace_id, name)')
})

test('explains why the last table column cannot be removed', async ({ page }) => {
  await createDatabaseCanvas(page, 'Last column refusal')
  await addTable(page, 'standalone')
  const card = page.locator('.db-table-card').filter({ hasText: 'standalone' })

  await card.dblclick()
  const editor = page.getByRole('dialog', { name: 'Edit Table' })
  await editor.getByRole('button', { name: 'Remove id' }).click()
  await expect(editor.getByLabel('Column 1 name')).toHaveValue('created_at')

  await editor.getByRole('button', { name: 'Remove created_at' }).click()
  await expect(editor.getByRole('alert')).toHaveText('A table needs at least one column.')
  await expect(editor.getByLabel('Column 1 name')).toHaveValue('created_at')

  await editor.getByRole('button', { name: 'Done' }).click()
  await expect(card.locator('.db-column-row')).toHaveCount(1)
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

test('edits enum values as plain lines and keeps Extra DDL read-only', async ({ page }) => {
  await createDatabaseCanvas(page, 'Enum and database forms')

  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Enum', exact: true }).click()
  await page.locator('.db-enum-card').dblclick()
  let editor = page.getByRole('dialog', { name: 'Edit Enum' })
  await expect(editor).toBeVisible()
  await editor.getByLabel('Name', { exact: true }).fill('task_status')
  const values = editor.getByLabel('Values', { exact: true })
  await expect(values).toHaveJSProperty('tagName', 'TEXTAREA')
  await values.fill('open\nin_progress\ndone')
  await editor.getByRole('button', { name: 'Done' }).click()
  await expect(page.locator('.db-enum-card')).toContainText('in_progress')

  await page.getByRole('button', { name: 'More canvas actions' }).click()
  await page.getByRole('menuitem', { name: 'Database settings', exact: true }).click()
  editor = page.getByRole('dialog', { name: 'Database settings' })
  await expect(editor).toBeVisible()
  await expect(editor.getByLabel('Extra DDL', { exact: true })).not.toBeEditable()
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click()
})

test('places new tables inside their lane', async ({ page }) => {
  await createDatabaseCanvas(page, 'Lane growth')

  await addTable(page, 'parent')
  const lane = page.locator('.react-flow__node').filter({ has: page.locator('.db-schema-card') }).first()
  const laneBefore = await lane.boundingBox()
  if (!laneBefore) throw new Error('Missing schema lane')

  await addTable(page, 'child')
  await page.waitForTimeout(500)
  const laneAfter = await lane.boundingBox()
  if (!laneAfter) throw new Error('Missing grown schema lane')
  expect(laneAfter.width).toBeGreaterThanOrEqual(laneBefore.width - 1)
  expect(laneAfter.height).toBeGreaterThanOrEqual(laneBefore.height - 1)

  const tables = page.locator('.db-table-card')
  await expect(tables).toHaveCount(2)
  for (let index = 0; index < await tables.count(); index += 1) {
    const box = await tables.nth(index).boundingBox()
    if (!box) throw new Error(`Missing table card ${index}`)
    expect(box.x).toBeGreaterThanOrEqual(laneAfter.x - 1)
    expect(box.y).toBeGreaterThanOrEqual(laneAfter.y - 1)
    expect(box.x + box.width).toBeLessThanOrEqual(laneAfter.x + laneAfter.width + 1)
    expect(box.y + box.height).toBeLessThanOrEqual(laneAfter.y + laneAfter.height + 1)
  }
})

test('opens the schema lane editor and keeps checks and column comments', async ({ page }) => {
  await createDatabaseCanvas(page, 'Schema and checks')

  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Schema (namespace)', exact: true }).click()
  await page.locator('.db-schema-head').dblclick()
  const schemaEditor = page.getByRole('dialog', { name: 'Edit Schema' })
  await expect(schemaEditor.getByLabel('Name', { exact: true })).toBeVisible()
  await expect(schemaEditor.getByLabel('Description', { exact: true })).toBeVisible()
  await schemaEditor.getByLabel('Name', { exact: true }).fill('app')
  await schemaEditor.getByLabel('Description', { exact: true }).fill('Application tables')
  await schemaEditor.getByRole('button', { name: 'Done' }).click()
  await expect(page.locator('.db-schema-card')).toContainText('Application tables')

  await addTable(page, 'audit_log')
  await page.locator('.db-table-card').filter({ hasText: 'audit_log' }).dblclick()
  let editor = page.getByRole('dialog', { name: 'Edit Table' })
  await editor.getByRole('button', { name: 'Add check' }).click()
  await editor.getByLabel('Check 1 name').fill('audit_log_created_check')
  await editor.getByLabel('Check 1 expression').fill('created_at IS NOT NULL')
  await editor.getByRole('button', { name: 'More for created_at', exact: true }).click()
  await editor.getByLabel('Column 2 comment').fill('When the row was written')
  await editor.getByRole('button', { name: 'Done' }).click()

  await page.locator('.db-table-card').filter({ hasText: 'audit_log' }).dblclick()
  editor = page.getByRole('dialog', { name: 'Edit Table' })
  await expect(editor.getByLabel('Check 1 name')).toHaveValue('audit_log_created_check')
  await expect(editor.getByLabel('Check 1 expression')).toHaveValue('created_at IS NOT NULL')
  await editor.getByRole('button', { name: 'More for created_at', exact: true }).click()
  await expect(editor.getByLabel('Column 2 comment')).toHaveValue('When the row was written')
  await editor.getByRole('button', { name: 'Done' }).click()

  await choosePostgresTarget(page)
  const ddl = await exportDdl(page)
  expect(ddl).toContain('CONSTRAINT audit_log_created_check CHECK (created_at IS NOT NULL)')
  expect(ddl).toContain("COMMENT ON COLUMN public.audit_log.created_at IS 'When the row was written'")
  expect(ddl).toContain("COMMENT ON SCHEMA app IS 'Application tables'")
})


test('names cards and Add menu items for assistive technology', async ({ page }) => {
  await createDatabaseCanvas(page, 'Accessible database')

  await page.getByRole('button', { name: 'Add', exact: true }).click()
  const menuItems = await page.getByRole('menuitem').evaluateAll((items) => (
    items.map((item) => ({
      text: item.textContent?.trim() ?? '',
      label: item.getAttribute('aria-label'),
    }))
  ))
  expect(menuItems.length).toBeGreaterThan(0)
  for (const item of menuItems) {
    expect(item.label, item.text).toBe(item.text)
  }
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Schema (namespace)', exact: true }).click()
  await page.locator('.db-schema-head').dblclick()
  let editor = page.getByRole('dialog', { name: 'Edit Schema' })
  await editor.getByLabel('Name', { exact: true }).fill('app')
  await editor.getByRole('button', { name: 'Done' }).click()

  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Enum', exact: true }).click()
  await page.locator('.db-enum-card').dblclick()
  editor = page.getByRole('dialog', { name: 'Edit Enum' })
  await editor.getByLabel('Name', { exact: true }).fill('task_status')
  await editor.getByRole('button', { name: 'Done' }).click()

  await addTable(page, 'task', 'app')

  await expect(page.locator('[aria-label="Schema app"]')).toBeVisible()
  await expect(page.locator('[aria-label="Enum public.task_status"]')).toBeVisible()
  await expect(page.locator('[aria-label="Table app.task"]')).toBeVisible()
})

test('previews sample rows and validates pasted test rows in the table editor', async ({ page }) => {
  await createDatabaseCanvas(page, 'Rows preview')

  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Table', exact: true }).click()
  const addDialog = page.getByRole('dialog', { name: 'Add table' })
  await addDialog.getByLabel('Table name').fill('row_preview')
  await addDialog.getByLabel('Id column').selectOption('bigint')
  await addDialog.getByRole('button', { name: 'Add table', exact: true }).click()
  await expect(page.locator('.db-table-card').filter({ hasText: 'row_preview' })).toBeVisible()
  await dismissNotice(page)

  await page.locator('.db-table-card').filter({ hasText: 'row_preview' }).dblclick()
  const editor = page.getByRole('dialog', { name: 'Edit Table' })
  await expect(editor.getByRole('tab', { name: 'Columns', exact: true })).toHaveAttribute('aria-selected', 'true')
  await editor.getByRole('button', { name: 'Add column', exact: true }).first().click()
  await editor.getByLabel('Column 3 name', { exact: true }).fill('name')
  await editor.getByLabel('Column 3 not null', { exact: true }).check()

  await editor.getByRole('tab', { name: 'Rows', exact: true }).click()
  await expect(editor.getByRole('tab', { name: 'Rows', exact: true })).toHaveAttribute('aria-selected', 'true')
  await editor.getByRole('button', { name: 'Generate', exact: true }).click()
  await expect(editor.getByText('1 of 1 rows valid', { exact: true })).toBeVisible()
  await expect(editor.getByLabel('Sample row 1 name', { exact: true })).toHaveValue('sample')

  await editor.getByLabel('Sample row 1 name', { exact: true }).fill('')
  await expect(editor.getByText('Required', { exact: true })).toBeVisible()
  await expect(editor.getByText('0 of 1 rows valid', { exact: true })).toBeVisible()
  await editor.getByLabel('Sample row 1 name', { exact: true }).fill('widget')
  await expect(editor.getByText('1 of 1 rows valid', { exact: true })).toBeVisible()

  await editor.getByRole('button', { name: 'Paste rows', exact: true }).click()
  await editor.getByRole('textbox', { name: 'Rows to paste', exact: true }).fill([
    'id,name,extra',
    '1,alpha,first',
    '1,beta,second',
  ].join('\n'))
  await editor.getByRole('button', { name: 'Import rows', exact: true }).click()
  await expect(editor.getByText('Ignored columns: extra', { exact: true })).toBeVisible()
  await expect(editor.getByText('Duplicate key', { exact: true }).first()).toBeVisible()
  await expect(editor.getByLabel('Test row 1 id', { exact: true })).toHaveValue('1')
  await expect(editor.getByLabel('Test row 2 id', { exact: true })).toHaveValue('1')

  await editor.getByRole('button', { name: 'Done', exact: true }).click()
  await page.locator('.db-table-card').filter({ hasText: 'row_preview' }).dblclick()
  const reopened = page.getByRole('dialog', { name: 'Edit Table' })
  await reopened.getByRole('tab', { name: 'Rows', exact: true }).click()
  await expect(reopened.getByLabel('Sample row 1 name', { exact: true })).toHaveValue('widget')
  await expect(reopened.getByText('1 of 1 rows valid', { exact: true })).toBeVisible()
  await expect(reopened.getByLabel(/^Test row 1 /)).toHaveCount(0)
  await expect(reopened.getByText('0 of 0 rows valid', { exact: true })).toBeVisible()

  await reopened.getByRole('tab', { name: 'Columns', exact: true }).click()
  await reopened.getByLabel('Column 3 name', { exact: true }).fill('label')
  await reopened.getByRole('tab', { name: 'Rows', exact: true }).click()
  await expect(reopened.getByRole('region', { name: 'Sample rows' }).getByRole('columnheader', { name: /label/ })).toBeVisible()
  await expect(reopened.getByLabel('Sample row 1 label', { exact: true })).toHaveValue('widget')
  await reopened.getByRole('button', { name: 'Done', exact: true }).click()

  await page.locator('.db-table-card').filter({ hasText: 'row_preview' }).dblclick()
  const afterRename = page.getByRole('dialog', { name: 'Edit Table' })
  await afterRename.getByRole('tab', { name: 'Rows', exact: true }).click()
  await expect(afterRename.getByLabel('Sample row 1 label', { exact: true })).toHaveValue('widget')
  await afterRename.getByRole('button', { name: 'Done', exact: true }).click()
})
