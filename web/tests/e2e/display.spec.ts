import { expect, test } from '@playwright/test'

test('filters edges with Display, reveals a selected card, and resets', async ({ page, request }) => {
  const response = await request.post('/v1/canvases/import', {
    headers: { authorization: 'Bearer local-dev' },
    data: {
      title: 'Display control',
      canvas: {
        nodes: [
          {
            id: 'system', type: 'text', x: 0, y: 0, width: 320, height: 220, text: '',
            app: { entityType: 'system', fields: { name: 'Order Service', kind: 'service' } },
          },
          {
            id: 'job', type: 'text', x: 460, y: 0, width: 300, height: 200, text: '',
            app: { entityType: 'system', fields: { name: 'Checkout', kind: 'job' } },
          },
          {
            id: 'repository', type: 'text', x: 0, y: 320, width: 320, height: 200, text: '',
            app: { entityType: 'repository', fields: { name: 'Orders' } },
          },
          {
            id: 'schema', type: 'text', x: 460, y: 320, width: 320, height: 220, text: '',
            app: { entityType: 'schema', fields: { name: 'Order', kind: 'api', version: '1.0.0' } },
          },
          {
            id: 'note', type: 'text', x: 900, y: 160, width: 300, height: 200, text: '',
            app: { entityType: 'note', fields: { name: 'Delivery note' } },
          },
        ],
        edges: [
          { id: 'uses', fromNode: 'system', toNode: 'job', app: { relationType: 'uses' } },
          { id: 'defines-repo', fromNode: 'repository', toNode: 'schema', app: { relationType: 'defines' } },
          { id: 'defines-system', fromNode: 'system', toNode: 'schema', app: { relationType: 'defines' } },
          { id: 'relates', fromNode: 'note', toNode: 'system', app: { relationType: 'relates_to' } },
          { id: 'untyped', fromNode: 'system', toNode: 'note' },
        ],
        app: { profile: 'systems', profileVersion: 4 },
      },
    },
  })
  expect(response.ok()).toBe(true)
  const canvas = await response.json()
  await page.goto(`/canvas/${canvas.id}`)
  await expect(page.locator('.canvas-flow')).toBeVisible()

  await expect(page.locator('.react-flow__edge')).toHaveCount(2)
  await expect(page.getByRole('button', { name: /3 edges hidden/ })).toContainText('0 cards, 3 edges hidden')

  await page.getByRole('button', { name: 'Display', exact: true }).click()
  const display = page.getByRole('dialog', { name: 'Display' })
  await expect(display).toBeVisible()
  await display.getByRole('button', { name: 'Minimal', exact: true }).click()
  await page.keyboard.press('Escape')

  await expect(page.locator('.react-flow__edge')).toHaveCount(2)
  await expect(page.getByRole('button', { name: /3 edges hidden/ })).toContainText('0 cards, 3 edges hidden')

  await page.locator('.entity-node').filter({ hasText: 'Order Service' }).click()
  await expect(page.locator('.react-flow__edge')).toHaveCount(4)
  await expect(page.getByRole('button', { name: /1 edge hidden/ })).toContainText('0 cards, 1 edge hidden')

  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /edges hidden/ }).click()
  await display.getByRole('button', { name: 'Reset' }).click()
  await page.keyboard.press('Escape')

  await expect(page.locator('.react-flow__edge')).toHaveCount(2)
  await expect(page.getByRole('button', { name: /3 edges hidden/ })).toContainText('0 cards, 3 edges hidden')
})
