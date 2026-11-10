import { expect, test } from '@playwright/test'
import { createCanvas } from './helpers'

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
  await page.getByLabel('Add template').selectOption('schema')

  const card = page.locator('.schema-card')
  await expect(card).toContainText('Valid schema')
  await expect(card).toContainText('Review required')
  await card.dblclick()
  await expect(page.getByRole('dialog', { name: 'Edit schema contract' })).toBeVisible()

  const source = page.locator('.schema-source-input')
  await source.fill('{"type":')
  await expect(page.locator('.schema-diagnostics')).toContainText('Invalid JSON')
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.locator('.validation-button')).toContainText('error')
  await expect(page.locator('.canvas-warning-badge').first()).toBeVisible()
  await page.locator('.canvas-warning-badge').first().click()
  await expect(page.locator('.validation-panel')).toBeVisible()
  await expect(page.locator('.validation-item.active')).toContainText('Untitled Schema')
  await page.getByRole('button', { name: 'Close warnings' }).click()
  await card.dblclick()
  await source.fill(validSchema)
  await expect(page.locator('.schema-diagnostics')).toContainText('No schema issues')
  await expect(page.locator('.schema-table tbody tr')).toHaveCount(2)
  await expect(page.locator('.schema-table')).toContainText('id')
  await expect(page.locator('.schema-table')).toContainText('total')
  await page.getByRole('button', { name: 'Tree' }).click()
  await expect(page.locator('.schema-outline-row')).toHaveCount(3)
  await page.getByRole('button', { name: 'Table' }).click()

  await page.getByLabel('Name').fill('Order contract')
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
