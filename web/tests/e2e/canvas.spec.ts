import { fileURLToPath } from 'node:url'

import { expect, test } from '@playwright/test'

test('creates a canvas, edits a card, saves, and reopens it', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Canvases', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'New canvas' }).click()
  await expect(page.getByRole('heading', { name: 'Untitled canvas', level: 1 })).toBeVisible()

  await page.getByRole('button', { name: 'Add card' }).click()
  await expect(page.locator('.text-node')).toHaveCount(1)
  await page.locator('.node-text').dblclick()
  await page.locator('.node-textarea').fill('E2E card')
  await page.keyboard.press('Escape')
  await expect(page.locator('.text-node')).toContainText('E2E card')

  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/canvas-editor.png', fullPage: true })

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Canvases', exact: true })).toBeVisible()
  await page.locator('.canvas-card').first().click()
  await expect(page.getByRole('heading', { name: 'Untitled canvas', level: 1 })).toBeVisible()
  await expect(page.locator('.text-node')).toContainText('E2E card')
})

test('adds a repository template and edits its fields', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New canvas' }).click()
  await page.getByLabel('Add template').selectOption('repository')
  await expect(page.locator('.entity-node')).toHaveCount(1)

  await page.locator('.entity-node').dblclick()
  await page.locator('.entity-field input').first().fill('Skyward Engine')
  await expect(page.locator('.entity-head strong')).toContainText('Skyward Engine')

  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/entity-card.png', fullPage: true })
})


test('adds a highlighted code card', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New canvas' }).click()
  await page.getByLabel('Add template').selectOption('code')
  await expect(page.locator('.code-node')).toHaveCount(1)

  await page.locator('.code-node').dblclick()
  await page.locator('.code-input').fill('const answer: number = 42')
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.locator('.code-node')).toContainText('const answer: number = 42')

  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/code-card.png', fullPage: true })
})

test('supports undo, redo, duplicate, and the shortcuts dialog', async ({ page }) => {
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
  await page.goto('/')
  await page.getByRole('button', { name: 'New canvas' }).click()
  await page.getByRole('button', { name: 'Add card' }).click()
  await expect(page.locator('.text-node')).toHaveCount(1)

  await page.waitForTimeout(400)
  await page.keyboard.press(`${modifier}+z`)
  await expect(page.locator('.text-node')).toHaveCount(0)

  await page.keyboard.press(`${modifier}+Shift+z`)
  await expect(page.locator('.text-node')).toHaveCount(1)

  await page.locator('.text-node').click()
  await page.keyboard.press(`${modifier}+d`)
  await expect(page.locator('.text-node')).toHaveCount(2)

  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click()
  await expect(page.getByRole('dialog')).toContainText('Undo')
  await expect(page.getByRole('dialog')).toContainText('Zoom to fit')
  await page.screenshot({ path: 'test-results/shortcuts-dialog.png', fullPage: true })
  await page.getByRole('button', { name: 'Close keyboard shortcuts' }).click()
})

test('creates a card by dragging an edge to empty space and labels the edge', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New canvas' }).click()
  await page.getByRole('button', { name: 'Add card' }).click()
  await expect(page.locator('.text-node')).toHaveCount(1)

  const handle = page.locator('.react-flow__handle-right').first()
  const handleBox = await handle.boundingBox()
  const flowBox = await page.locator('.canvas-flow').boundingBox()
  if (!handleBox || !flowBox) throw new Error('Missing canvas geometry')

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(flowBox.x + flowBox.width - 240, flowBox.y + 220, { steps: 12 })
  await page.mouse.up()

  await expect(page.locator('.connection-menu')).toBeVisible()
  await page.screenshot({ path: 'test-results/connection-menu.png', fullPage: true })
  await page.locator('.connection-option', { hasText: 'Code' }).click()
  await expect(page.locator('.code-node')).toHaveCount(1)
  await expect(page.locator('.react-flow__edge')).toHaveCount(1)

  const firstLabel = await page.locator('.edge-label').boundingBox()
  if (!firstLabel) throw new Error('Missing edge label')
  await page.mouse.dblclick(firstLabel.x + firstLabel.width / 2, firstLabel.y + firstLabel.height / 2)
  await expect(page.locator('.edge-label-editor')).toBeVisible()
  await page.locator('.edge-label-editor input').fill('implements')
  await page.locator('.edge-label-editor').getByRole('button', { name: 'Save' }).click()
  await expect(page.locator('.edge-label')).toContainText('implements')

  const layerZ = await page.evaluate(() => {
    const edges = document.querySelector('.react-flow__edges')
    const nodes = document.querySelector('.react-flow__nodes')
    return {
      edges: Number(getComputedStyle(edges as Element).zIndex),
      nodes: Number(getComputedStyle(nodes as Element).zIndex),
    }
  })
  expect(layerZ.edges).toBeGreaterThan(layerZ.nodes)

  const selectedLabel = await page.locator('.edge-label').boundingBox()
  if (!selectedLabel) throw new Error('Missing edge label')
  await page.mouse.click(selectedLabel.x + selectedLabel.width / 2, selectedLabel.y + selectedLabel.height / 2)
  await expect(page.locator('.selection-toolbar')).toContainText('1 selected')
  const before = await page.locator('.react-flow__edge-path').first().getAttribute('d')
  await page.locator('.selection-toolbar').getByRole('button', { name: 'Reverse' }).click()
  const after = await page.locator('.react-flow__edge-path').first().getAttribute('d')
  expect(after).not.toBe(before)

  await page.locator('.selection-toolbar').getByRole('button', { name: 'Color 1' }).click()
  const stroke = await page.locator('.canvas-edge-main').first().evaluate(
    (element) => getComputedStyle(element).stroke,
  )
  expect(stroke).toBe('rgb(251, 70, 76)')
  await page.screenshot({ path: 'test-results/edge-controls.png', fullPage: true })
})

test('uses the selection toolbar to duplicate, group, and delete', async ({ page }) => {
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
  await page.goto('/')
  await page.getByRole('button', { name: 'New canvas' }).click()
  await page.getByRole('button', { name: 'Add card' }).click()
  await expect(page.locator('.selection-toolbar')).toContainText('1 selected')
  await page.screenshot({ path: 'test-results/selection-toolbar.png', fullPage: true })

  await page.locator('.selection-toolbar').getByRole('button', { name: 'Duplicate' }).click()
  await expect(page.locator('.text-node')).toHaveCount(2)

  await page.keyboard.press(`${modifier}+a`)
  await expect(page.locator('.selection-toolbar')).toContainText('2 selected')
  await page.locator('.selection-toolbar').getByRole('button', { name: 'Group' }).click()
  await expect(page.locator('.group-node')).toHaveCount(1)

  await page.locator('.selection-toolbar').getByRole('button', { name: 'Delete' }).click()
  await expect(page.locator('.group-node')).toHaveCount(0)
  await expect(page.locator('.text-node')).toHaveCount(2)
})

test('shows alignment guides while dragging a card', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New canvas' }).click()
  await page.getByRole('button', { name: 'Add card' }).click()
  await page.getByRole('button', { name: 'Add card' }).click()
  const cards = page.locator('.text-node')
  const second = await cards.nth(1).boundingBox()
  if (!second) throw new Error('Missing second card')

  await page.mouse.move(second.x + 30, second.y + 20)
  await page.mouse.down()
  await page.mouse.move(second.x + 30, second.y + 170, { steps: 12 })
  await expect(page.locator('.alignment-guide').first()).toBeVisible()
  await page.screenshot({ path: 'test-results/alignment-guides.png', fullPage: true })
  await page.mouse.up()
})

test('aligns a card to a group edge', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New canvas' }).click()
  await page.getByRole('button', { name: 'Add card' }).click()
  await page.locator('.selection-toolbar').getByRole('button', { name: 'Group' }).click()
  await expect(page.locator('.group-node')).toHaveCount(1)

  await page.getByRole('button', { name: 'Add card' }).click()
  const cards = page.locator('.text-node')
  await expect(cards).toHaveCount(2)

  const first = await cards.nth(1).boundingBox()
  if (!first) throw new Error('Missing card')
  await page.mouse.move(first.x + 30, first.y + 20)
  await page.mouse.down()
  await page.mouse.move(first.x + 430, first.y + 20, { steps: 12 })
  await page.mouse.up()

  const group = await page.locator('.group-node').boundingBox()
  const second = await cards.nth(1).boundingBox()
  if (!group || !second) throw new Error('Missing alignment geometry')

  await page.mouse.move(second.x + 30, second.y + 20)
  await page.mouse.down()
  await page.mouse.move(group.x + group.width + 3 + 30, second.y + 20, { steps: 12 })
  await expect(page.locator('.alignment-guide').first()).toBeVisible()
  await page.screenshot({ path: 'test-results/group-alignment-guide.png', fullPage: true })
  await page.mouse.up()
})

test('colors a group without hiding its edges', async ({ page }) => {
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
  await page.goto('/')
  await page.getByRole('button', { name: 'New canvas' }).click()
  await page.getByRole('button', { name: 'Add card' }).click()

  const handle = page.locator('.react-flow__handle-right').first()
  const handleBox = await handle.boundingBox()
  const flowBox = await page.locator('.canvas-flow').boundingBox()
  if (!handleBox || !flowBox) throw new Error('Missing canvas geometry')
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(flowBox.x + flowBox.width - 300, flowBox.y + 240, { steps: 12 })
  await page.mouse.up()
  await page.locator('.connection-option', { hasText: 'Note' }).click()

  await page.keyboard.press(`${modifier}+a`)
  await page.locator('.selection-toolbar').getByRole('button', { name: 'Group' }).click()
  await page.locator('.group-node').click({ position: { x: 20, y: 90 } })
  await expect(page.locator('.selection-toolbar')).toContainText('1 selected')
  await page.locator('.selection-toolbar').getByRole('button', { name: 'Color 1' }).click()

  const background = await page.locator('.group-node').first().evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  )
  expect(background).toContain('251, 70, 76')
  await expect(page.locator('.react-flow__edge')).toHaveCount(1)
  await page.screenshot({ path: 'test-results/group-color.png', fullPage: true })
})

test('continues markdown lists while editing a card', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New canvas' }).click()
  await page.getByRole('button', { name: 'Add card' }).click()
  await page.locator('.node-text').dblclick()
  const editor = page.locator('.node-textarea')
  await editor.fill('- first')
  await editor.press('Enter')
  await expect(editor).toHaveValue('- first\n- ')
  await editor.type('second')
  await expect(editor).toHaveValue('- first\n- second')
  await editor.press('Escape')
  await expect(page.locator('.node-markdown li')).toHaveCount(2)
})

test('does not capture a card that merely overlaps a group', async ({ page }) => {
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
  await page.goto('/')
  await page.getByRole('button', { name: 'New canvas' }).click()
  await page.getByRole('button', { name: 'Add card' }).click()
  await page.getByRole('button', { name: 'Add card' }).click()
  await page.keyboard.press(`${modifier}+a`)
  await page.locator('.selection-toolbar').getByRole('button', { name: 'Group' }).click()

  await page.getByRole('button', { name: 'Add card' }).click()
  const cards = page.locator('.text-node')
  await expect(cards).toHaveCount(3)
  const overlapping = cards.nth(2)
  const before = await overlapping.boundingBox()
  if (!before) throw new Error('Missing overlapping card')

  const group = await page.locator('.group-node').boundingBox()
  if (!group) throw new Error('Missing group')
  await page.mouse.click(group.x + group.width - 12, group.y + group.height - 12)
  await expect(page.locator('.selection-toolbar')).toContainText('1 selected')

  await page.mouse.move(group.x + group.width - 12, group.y + group.height - 12)
  await page.mouse.down()
  await page.mouse.move(group.x + group.width + 108, group.y + group.height + 68, { steps: 10 })
  await page.mouse.up()

  const after = await overlapping.boundingBox()
  if (!after) throw new Error('Missing overlapping card after drag')
  expect(Math.abs(after.x - before.x)).toBeLessThan(2)
  expect(Math.abs(after.y - before.y)).toBeLessThan(2)
})


test('imports an Obsidian canvas file as a native canvas', async ({ page }) => {
  const fixture = fileURLToPath(new URL('../fixtures/obsidian-example.canvas', import.meta.url))
  await page.goto('/')
  await page.locator('input[type="file"]').setInputFiles(fixture)

  await expect(page.getByRole('heading', { name: 'obsidian-example', level: 1 })).toBeVisible()
  await expect(page.locator('.text-node')).toHaveCount(2)
  await expect(page.locator('.file-node')).toHaveCount(0)
  await expect(page.locator('.link-node')).toHaveCount(1)
  await expect(page.locator('.group-node')).toHaveCount(1)
  await expect(page.locator('.react-flow__edge')).toHaveCount(1)
  await expect(page.getByText('Imported from Obsidian')).toBeVisible()
  await expect(page.getByText('Notes/Example.md')).toBeVisible()
  await page.screenshot({ path: 'test-results/imported-canvas.png', fullPage: true })
})

test('finishes entity editing when clicking outside the card', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New canvas' }).click()
  await page.getByLabel('Add template').selectOption('repository')
  await page.locator('.entity-node').dblclick()
  await page.locator('.entity-field input').first().fill('Click-outside repo')
  const pane = await page.locator('.canvas-flow').boundingBox()
  if (!pane) throw new Error('Missing canvas pane')
  await page.mouse.click(pane.x + 30, pane.y + 30)
  await expect(page.locator('.entity-form')).toHaveCount(0)
  await expect(page.locator('.entity-head strong')).toContainText('Click-outside repo')
})

test('changes a card type from the selection toolbar', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New canvas' }).click()
  await page.getByLabel('Add template').selectOption('repository')
  await page.locator('.entity-node').dblclick()
  await page.locator('.entity-field input').first().fill('Shared model')
  const pane = await page.locator('.canvas-flow').boundingBox()
  if (!pane) throw new Error('Missing canvas pane')
  await page.mouse.click(pane.x + 30, pane.y + 30)
  await expect(page.locator('.entity-head strong')).toContainText('Shared model')

  await page.locator('.entity-node').click()
  await expect(page.locator('.selection-toolbar')).toContainText('1 selected')
  await page.locator('.selection-toolbar').getByRole('combobox', { name: 'Card type' }).selectOption('database')
  await expect(page.locator('.entity-type')).toHaveText('Database')
  await expect(page.locator('.entity-head strong')).toContainText('Shared model')
  await page.screenshot({ path: 'test-results/card-type-change.png', fullPage: true })
})

test('drags a card on the first pointer gesture without entering edit mode', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New canvas' }).click()
  await page.getByRole('button', { name: 'Add card' }).click()
  const card = page.locator('.text-node')
  const before = await card.boundingBox()
  const pane = await page.locator('.canvas-flow').boundingBox()
  if (!before || !pane) throw new Error('Missing geometry')

  await page.mouse.click(pane.x + 20, pane.y + 20)
  await page.mouse.move(before.x + 50, before.y + 40)
  await page.mouse.down()
  await page.mouse.move(before.x + 150, before.y + 120, { steps: 12 })
  await page.mouse.up()

  const after = await card.boundingBox()
  if (!after) throw new Error('Missing card after drag')
  expect(after.x).not.toBe(before.x)
  await expect(page.locator('.node-textarea')).toHaveCount(0)
})

test('does not move a card when dragging inside the text editor', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New canvas' }).click()
  await page.getByRole('button', { name: 'Add card' }).click()
  const card = page.locator('.text-node')
  await page.locator('.node-text').dblclick()
  const before = await card.boundingBox()
  if (!before) throw new Error('Missing card')
  await page.mouse.move(before.x + 50, before.y + 60)
  await page.mouse.down()
  await page.mouse.move(before.x + 150, before.y + 160, { steps: 10 })
  await page.mouse.up()
  const after = await card.boundingBox()
  if (!after) throw new Error('Missing card after edit drag')
  expect(after.x).toBe(before.x)
  expect(after.y).toBe(before.y)
  await expect(page.locator('.node-textarea')).toHaveCount(1)
})
