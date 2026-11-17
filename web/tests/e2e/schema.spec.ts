import { expect, test } from '@playwright/test'
import { addCanvasItem, createCanvas } from './helpers'

const validSchema = JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Order',
  type: 'object',
  properties: {
    id: { type: 'string' },
    total: { type: 'number' },
  },
  required: ['id'],
}, null, 2)

test('designs and validates a JSON Schema contract', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Canvas type').selectOption('systems')
  await createCanvas(page)
  await addCanvasItem(page, 'Schema')

  const card = page.locator('.schema-card')
  await expect(card).toContainText('Valid schema')
  await expect(card).toContainText('Review required')
  await card.dblclick()
  const dialog = page.getByRole('dialog', { name: 'Edit schema contract' })
  await expect(dialog).toBeVisible()

  await dialog.getByRole('tab', { name: 'JSON' }).click()
  const source = page.locator('.schema-source-input')
  await source.fill('{"type":')
  await expect(page.locator('.schema-diagnostics')).toContainText('Invalid JSON')
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.locator('.canvas-warning-badge').first()).toBeVisible()
  await page.locator('.canvas-warning-badge').first().click()
  await expect(page.locator('.validation-panel')).toBeVisible()
  await expect(page.locator('.validation-item.active')).toContainText('Untitled Schema')
  await page.getByRole('button', { name: 'Close review' }).click()
  await card.dblclick()
  await source.fill(validSchema)
  await expect(page.locator('.schema-diagnostics')).toContainText('No schema issues')
  await expect(page.locator('.schema-table tbody tr')).toHaveCount(2)
  await expect(page.locator('.schema-table')).toContainText('id')
  await expect(page.locator('.schema-table')).toContainText('total')
  await page.getByRole('button', { name: 'Tree' }).click()
  await expect(page.locator('.schema-outline-row')).toHaveCount(3)
  await page.getByRole('button', { name: 'Table' }).click()

  await page.getByLabel('Name', { exact: true }).fill('Order contract')
  await page.getByLabel('Owner').fill('Tower')
  await page.getByLabel('Review status').selectOption('approved')
  await page.getByLabel('Reviewed version').fill('1.0.0')
  await page.getByLabel('Last reviewed').fill('2026-11-01')
  await page.getByRole('button', { name: 'Done' }).click()

  await expect(page.locator('.schema-card')).toContainText('Order contract')
  await expect(page.locator('.schema-card')).toContainText('Valid schema')
  await expect(page.locator('.schema-card')).toContainText('Reviewed')
  await expect(page.locator('.schema-card')).toContainText('id')
  await expect(page.locator('.schema-card')).toContainText('total')
})

test('builds a required field in Fields and validates it in Rows', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Canvas type').selectOption('systems')
  await createCanvas(page)
  await addCanvasItem(page, 'Schema')
  await page.locator('.schema-card').dblclick()
  const dialog = page.getByRole('dialog', { name: 'Edit schema contract' })
  await dialog.getByRole('tab', { name: 'Fields' }).click()
  await dialog.getByRole('button', { name: 'Add field' }).click()
  const name = dialog.getByLabel('Field name field')
  await name.fill('email')
  await name.press('Tab')
  await dialog.getByLabel('Required email').check()

  await dialog.getByRole('tab', { name: 'Rows' }).click()
  await dialog.getByRole('button', { name: 'Add row' }).click()
  const examples = dialog.locator('.schema-row-set').first()
  await expect(examples.locator('.schema-rows-table thead')).toContainText('email *')
  const cell = dialog.getByLabel('email')
  await cell.fill('person@example.com')
  const row = examples.locator('.schema-rows-table tbody tr').first()
  await expect(row).toHaveClass(/valid/)
  await cell.fill('')
  await expect(row).toHaveClass(/invalid/)
  await expect(row.locator('.schema-row-status')).toContainText('✗')
})
