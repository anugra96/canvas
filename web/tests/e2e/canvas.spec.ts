import { fileURLToPath } from 'node:url'

import { expect, test } from '@playwright/test'
import { createCanvas } from './helpers'

test('creates a canvas, edits a card, saves, and reopens it', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Canvases', exact: true })).toBeVisible()

  await createCanvas(page)
  await expect(page.getByRole('heading', { name: 'Untitled canvas', level: 1 })).toBeVisible()

  await page.getByRole('button', { name: 'Add card' }).click()
  await expect(page.locator('.text-node')).toHaveCount(1)
  await page.locator('.node-text').dblclick()
  await page.locator('.rich-editor-content').fill('E2E card')
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

test('names a new canvas and renames it from the editor and list', async ({ page }) => {
  await page.goto('/')
  await createCanvas(page, 'Named board')
  await expect(page.getByRole('heading', { name: 'Named board', level: 1 })).toBeVisible()

  await page.getByRole('button', { name: 'Edit canvas title' }).click()
  let dialog = page.getByRole('dialog', { name: 'Rename canvas' })
  await dialog.getByLabel('Canvas name').fill('Renamed board')
  await dialog.getByRole('button', { name: 'Save name' }).click()
  await expect(page.getByRole('heading', { name: 'Renamed board', level: 1 })).toBeVisible()

  await page.getByRole('button', { name: 'All canvases' }).click()
  const card = page.locator('.canvas-card').filter({ hasText: 'Renamed board' })
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: 'Edit title for Renamed board' }).click()
  dialog = page.getByRole('dialog', { name: 'Rename canvas' })
  await dialog.getByLabel('Canvas name').fill('Final board')
  await dialog.getByRole('button', { name: 'Save name' }).click()
  await expect(page.locator('.canvas-card').filter({ hasText: 'Final board' })).toBeVisible()
})

test('opens a card menu on empty-canvas double click', async ({ page }) => {
  await page.goto('/')
  await createCanvas(page)
  const flowBox = await page.locator('.canvas-flow').boundingBox()
  if (!flowBox) throw new Error('Missing canvas')
  const point = { x: flowBox.x + 520, y: flowBox.y + 300 }
  await page.mouse.dblclick(point.x, point.y)

  await expect(page.locator('.connection-menu')).toBeVisible()
  await expect(page.locator('.connection-menu header')).toContainText('Create card')
  await expect(page.locator('.connection-option').filter({ hasText: 'Text card' })).toBeVisible()
  await page.locator('.connection-option', { hasText: 'Code' }).click()
  await expect(page.locator('.code-node')).toHaveCount(1)
  const card = await page.locator('.code-node').boundingBox()
  if (!card) throw new Error('Missing created card')
  expect(Math.abs(card.x + card.width / 2 - point.x)).toBeLessThan(5)
  expect(Math.abs(card.y + card.height / 2 - point.y)).toBeLessThan(5)
})

test('adds a repository template and edits its fields', async ({ page }) => {
  await page.goto('/')
  await createCanvas(page)
  await page.getByLabel('Add template').selectOption('repository')
  await expect(page.locator('.entity-node')).toHaveCount(1)

  await page.locator('.entity-node').dblclick()
  await page.locator('.entity-field input').first().fill('Canvas Engine')
  await expect(page.locator('.entity-head strong')).toContainText('Canvas Engine')
  await page.getByRole('button', { name: 'Done' }).click()

  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/entity-card.png', fullPage: true })
})


test('creates a Systems canvas with typed cards and profile persistence', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Canvas type').selectOption('systems')
  await createCanvas(page)

  await expect(page.locator('.profile-badge')).toHaveText('Systems')
  await expect(page.getByRole('button', { name: 'Add card' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Add note' })).toBeVisible()

  await page.getByLabel('Add template').selectOption('actor')
  await page.getByLabel('Add template').selectOption('system')
  await page.getByLabel('Add template').selectOption('system')
  await page.getByRole('button', { name: 'Add note' }).click()
  await expect(page.locator('.entity-node')).toHaveCount(4)
  await expect(page.locator('.entity-type')).toContainText(['Actor', 'System', 'Note'])
  await expect(page.getByRole('button', { name: 'Systems validation' })).toContainText('3 warnings')
  await page.getByRole('button', { name: 'Systems validation' }).click()
  await expect(page.locator('.validation-tray')).toContainText('Fill the empty required fields.')
  await page.locator('.validation-group-toggle').filter({ hasText: 'Missing required field' }).click()
  await page.locator('.validation-group').filter({ hasText: 'Missing required field' }).locator('.validation-item-main').first().click()
  await expect(page.locator('.validation-tray')).toContainText('field "Name"')
  await page.getByRole('button', { name: 'Close warnings' }).click()

  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/systems-canvas.png', fullPage: true })

  await page.getByRole('button', { name: 'All canvases' }).click()
  await expect(page.locator('.canvas-card').first()).toContainText('Systems')
  await page.locator('.canvas-card').first().click()
  await expect(page.locator('.profile-badge')).toHaveText('Systems')
  await expect(page.locator('.entity-node')).toHaveCount(4)
})

test('filters Systems edge relations by source and target', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Canvas type').selectOption('systems')
  await createCanvas(page)
  for (const template of ['system', 'system', 'system', 'system']) {
    await page.getByLabel('Add template').selectOption(template)
    await page.waitForTimeout(120)
  }
  await expect(page.locator('.entity-node')).toHaveCount(4)
  await page.waitForTimeout(300)

  const nodes = page.locator('.react-flow__node')
  async function connect(fromIndex: number, fromSide: string, toIndex: number, toSide: string) {
    const from = await nodes.nth(fromIndex).locator(`.react-flow__handle-${fromSide}`).boundingBox()
    const to = await nodes.nth(toIndex).locator(`.react-flow__handle-${toSide}`).boundingBox()
    if (!from || !to) throw new Error('Missing connection handles')
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 })
    await page.mouse.up()
  }

  await connect(0, 'right', 1, 'left')
  await expect(page.locator('.react-flow__edge')).toHaveCount(1)
  const firstLabel = await page.locator('.edge-label').first().boundingBox()
  if (!firstLabel) throw new Error('Missing first edge label')
  await page.mouse.click(firstLabel.x + firstLabel.width / 2, firstLabel.y + firstLabel.height / 2)
  const relation = page.getByLabel('Edge relation')
  await expect(relation).toHaveValue('')
  const relationOptions = await relation.locator('option').allInnerTexts()
  expect(relationOptions).toEqual(expect.arrayContaining(['Unspecified', 'runs', 'uses', 'produces', 'defines', 'describes']))
  await relation.selectOption('uses')
  await expect(relation).toHaveValue('uses')

  await connect(2, 'right', 3, 'left')
  await expect(page.locator('.react-flow__edge')).toHaveCount(2)
  const secondLabel = await page.locator('.edge-label').nth(1).boundingBox()
  if (!secondLabel) throw new Error('Missing second edge label')
  await page.mouse.click(secondLabel.x + secondLabel.width / 2, secondLabel.y + secondLabel.height / 2)
  await expect(relation).toHaveValue('')
  await relation.selectOption('uses')
  await expect(relation).toHaveValue('uses')
})

test('allows an untyped connection between arbitrary cards', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Canvas type').selectOption('systems')
  await createCanvas(page)
  await page.getByLabel('Add template').selectOption('repository')
  await page.getByLabel('Add template').selectOption('system')
  await expect(page.locator('.entity-node')).toHaveCount(2)
  await page.waitForTimeout(300)

  const nodes = page.locator('.react-flow__node')
  const from = await nodes.nth(0).locator('.react-flow__handle-right').boundingBox()
  const to = await nodes.nth(1).locator('.react-flow__handle-left').boundingBox()
  if (!from || !to) throw new Error('Missing connection handles')
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 })
  await page.mouse.up()

  await expect(page.locator('.react-flow__edge')).toHaveCount(1)
  await expect(page.locator('.edge-label')).toContainText('Define relation')
  const label = await page.locator('.edge-label').boundingBox()
  if (!label) throw new Error('Missing edge label')
  await page.mouse.click(label.x + label.width / 2, label.y + label.height / 2)
  await expect(page.getByLabel('Edge relation')).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Systems validation' })).toContainText('warnings')
})

test('adds Process and Artifact cards in Systems mode', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Canvas type').selectOption('systems')
  await createCanvas(page)
  await page.getByLabel('Add template').selectOption('process')
  await page.getByLabel('Add template').selectOption('artifact')
  await expect(page.locator('.entity-type')).toContainText(['Process', 'Artifact'])
  await expect(page.getByLabel('Add template').locator('option')).toContainText([
    'System',
    'Repository',
    'Actor',
    'Process',
    'Artifact',
    'Schema',
    'Note',
    'Decision',
    'Risk',
  ])
})

test('uses the note name in the card header', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Canvas type').selectOption('systems')
  await createCanvas(page)
  await page.getByRole('button', { name: 'Add note' }).click()
  await page.locator('.entity-node').dblclick()
  await page.locator('[data-field-key="name"]').fill('Review note')
  await page.locator('.entity-content-field .rich-editor-content').fill('This is the note body.')
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.locator('.entity-head strong')).toHaveText('Review note')
  await expect(page.locator('.entity-content-preview')).toContainText('This is the note body.')
})

test('adds a highlighted code card', async ({ page }) => {
  await page.goto('/')
  await createCanvas(page)
  await page.getByLabel('Add template').selectOption('code')
  await expect(page.locator('.code-node')).toHaveCount(1)

  await page.locator('.code-node').dblclick()
  await expect(page.locator('.property-drawer-body')).toHaveCount(0)
  await expect(page.locator('.code-input')).toBeFocused()
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
  await createCanvas(page)
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
  await createCanvas(page)
  await page.getByRole('button', { name: 'Add card' }).click()
  await expect(page.locator('.text-node')).toHaveCount(1)

  const handle = page.locator('.react-flow__handle-right').first()
  const handleBox = await handle.boundingBox()
  const flowBox = await page.locator('.canvas-flow').boundingBox()
  if (!handleBox || !flowBox) throw new Error('Missing canvas geometry')

  const releaseX = flowBox.x + flowBox.width - 240
  const releaseY = flowBox.y + 220
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(releaseX, releaseY, { steps: 12 })
  await page.mouse.up()

  await expect(page.locator('.connection-menu')).toBeVisible()
  await expect(page.locator('.connection-preview')).toBeVisible()
  const menuBox = await page.locator('.connection-menu').boundingBox()
  if (!menuBox) throw new Error('Missing connection menu geometry')
  expect(Math.abs(menuBox.x - releaseX)).toBeLessThan(5)
  expect(Math.abs(menuBox.y - releaseY)).toBeLessThan(5)
  await page.screenshot({ path: 'test-results/connection-menu.png', fullPage: true })
  await page.locator('.connection-option', { hasText: 'Code' }).click()
  await expect(page.locator('.code-node')).toHaveCount(1)
  const codeBox = await page.locator('.code-node').boundingBox()
  if (!codeBox) throw new Error('Missing created card geometry')
  expect(Math.abs(codeBox.x + codeBox.width / 2 - releaseX)).toBeLessThan(5)
  expect(Math.abs(codeBox.y + codeBox.height / 2 - releaseY)).toBeLessThan(5)
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
  await createCanvas(page)
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
  await createCanvas(page)
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
  await createCanvas(page)
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
  await createCanvas(page)
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
  expect(background).toMatch(/(?:251, 70, 76|0\.984314 0\.27451 0\.298039)/)
  await expect(page.locator('.react-flow__edge')).toHaveCount(1)
  await page.screenshot({ path: 'test-results/group-color.png', fullPage: true })
})

test('continues markdown lists while editing a card', async ({ page }) => {
  await page.goto('/')
  await createCanvas(page)
  await page.getByRole('button', { name: 'Add card' }).click()
  await page.locator('.node-text').dblclick()
  await page.getByRole('button', { name: 'Raw', exact: true }).click()
  const editor = page.locator('.markdown-source')
  await editor.fill('- first')
  await editor.press('Enter')
  await expect(editor).toHaveValue('- first\n- ')
  await editor.type('second')
  await expect(editor).toHaveValue('- first\n- second')
  await editor.press('Escape')
  await expect(page.locator('.node-markdown li')).toHaveCount(2)
})

test('edits text cards directly in editable Markdown preview', async ({ page }) => {
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
  await page.goto('/')
  await createCanvas(page)
  await page.getByRole('button', { name: 'Add card' }).click()
  await page.locator('.node-text').dblclick()
  const editor = page.locator('.rich-editor-content')
  await expect(editor).toBeVisible()
  await editor.click()
  await page.keyboard.press(`${modifier}+b`)
  await page.keyboard.type('Bold text')
  await expect(editor.locator('strong')).toContainText('Bold text')
  await page.keyboard.press('Escape')
  await expect(page.locator('.node-markdown strong')).toContainText('Bold text')
})

test('renders and edits a markdown table in preview mode', async ({ page }) => {
  await page.goto('/')
  await createCanvas(page)
  await page.getByRole('button', { name: 'Add card' }).click()
  await page.locator('.node-text').dblclick()
  await page.getByRole('button', { name: 'Raw', exact: true }).click()
  const editor = page.locator('.markdown-source')
  await editor.fill('| Name | Value |\n| --- | --- |\n| Alpha | One |\n| Beta | Two |\n| Gamma | Three |')
  await page.getByRole('button', { name: 'Preview', exact: true }).click()

  const preview = page.locator('.rich-editor-content')
  await expect(preview.locator('table')).toBeVisible()
  await expect(preview.locator('th').first()).toContainText('Name')
  await expect(preview.locator('tr')).toHaveCount(4)
  await page.keyboard.press('Escape')
  await expect(page.locator('.node-markdown table')).toBeVisible()
})
test('does not capture a card that merely overlaps a group', async ({ page }) => {
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
  await page.goto('/')
  await createCanvas(page)
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
  await createCanvas(page)
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
  await createCanvas(page)
  await page.getByLabel('Add template').selectOption('repository')
  await page.locator('.entity-node').dblclick()
  await page.locator('.entity-field input').first().fill('Shared model')
  const pane = await page.locator('.canvas-flow').boundingBox()
  if (!pane) throw new Error('Missing canvas pane')
  await page.mouse.click(pane.x + 30, pane.y + 30)
  await expect(page.locator('.entity-head strong')).toContainText('Shared model')

  await page.locator('.entity-node').click()
  await expect(page.locator('.selection-toolbar')).toContainText('1 selected')
  await page.locator('.selection-toolbar').getByRole('combobox', { name: 'Card type' }).selectOption('process')
  await expect(page.locator('.entity-type')).toHaveText('Process')
  await expect(page.locator('.entity-head strong')).toContainText('Shared model')
  await page.screenshot({ path: 'test-results/card-type-change.png', fullPage: true })
})

test('drags a card on the first pointer gesture without entering edit mode', async ({ page }) => {
  await page.goto('/')
  await createCanvas(page)
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
  await createCanvas(page)
  await page.getByRole('button', { name: 'Add card' }).click()
  const card = page.locator('.text-node')
  await page.locator('.node-text').dblclick()
  const before = await card.boundingBox()
  const editor = page.locator('.rich-editor-content')
  const editorBox = await editor.boundingBox()
  if (!before || !editorBox) throw new Error('Missing geometry')
  await page.mouse.move(editorBox.x + 30, editorBox.y + 30)
  await page.mouse.down()
  await page.mouse.move(editorBox.x + 130, editorBox.y + 130, { steps: 10 })
  await page.mouse.up()
  const after = await card.boundingBox()
  if (!after) throw new Error('Missing card after edit drag')
  expect(after.x).toBe(before.x)
  expect(after.y).toBe(before.y)
  await expect(editor).toHaveCount(1)
})

test('supports code indentation, auto-closing, and comment toggling', async ({ page }) => {
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
  await page.goto('/')
  await createCanvas(page)
  await page.getByLabel('Add template').selectOption('code')
  await page.locator('.code-node').dblclick()
  const input = page.locator('.code-input')

  await input.type('if (true) {')
  await expect(input).toHaveValue('if (true) {}')
  await input.press('Enter')
  await expect(input).toHaveValue('if (true) {\n  \n}')
  await input.type('return 1')
  await expect(input).toHaveValue('if (true) {\n  return 1\n}')
  await input.press(`${modifier}+/`)
  await expect(input).toHaveValue('if (true) {\n  // return 1\n}')
  await page.screenshot({ path: 'test-results/code-editor.png', fullPage: true })
})


test('resizes a card from its resize handle', async ({ page }) => {
  await page.goto('/')
  await createCanvas(page)
  await page.getByRole('button', { name: 'Add card' }).click()
  const card = page.locator('.text-node')
  const before = await card.boundingBox()
  const handle = page.locator('.canvas-resize-handle.bottom.right')
  const handleBox = await handle.boundingBox()
  if (!before || !handleBox) throw new Error('Missing resize geometry')
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(handleBox.x + 120, handleBox.y + 90, { steps: 10 })
  await page.mouse.up()
  const after = await card.boundingBox()
  if (!after) throw new Error('Missing resized card')
  expect(after.width).toBeGreaterThan(before.width + 60)
  expect(after.height).toBeGreaterThan(before.height + 40)
})

test('fits a card to its content from the card edge', async ({ page }) => {
  await page.goto('/')
  await createCanvas(page)
  await page.getByLabel('Add template').selectOption('system')
  const card = page.locator('.entity-node')
  await card.dblclick()
  await page.locator('.entity-field input').first().fill('Auto fit system')
  await page.getByRole('button', { name: 'Raw', exact: true }).click()
  await page.locator('.entity-content-field .markdown-source').fill(
    Array.from({ length: 8 }, (_, index) => (
      `Paragraph ${index + 1}: this repository carries a deliberately long note so the card must grow to fit all of its content. `
      + 'The note continues with enough detail to wrap across several lines and exercise the fit calculation.'
    )).join('\n\n'),
  )
  await page.keyboard.press('Escape')

  const order = await card.evaluate((node) => {
    const body = node.querySelector('.entity-body')
    const row = body?.querySelector('.entity-row')
    const preview = body?.querySelector('.entity-content-preview')
    return Boolean(row && preview && (row.compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING))
  })
  expect(order).toBe(true)

  const before = await card.boundingBox()
  if (!before) throw new Error('Missing card before fit')
  const overflowBefore = await card.evaluate((node) => {
    const body = node.querySelector('.entity-body')
    return body ? { scrollHeight: body.scrollHeight, clientHeight: body.clientHeight } : null
  })
  if (!overflowBefore) throw new Error('Missing card body before fit')
  expect(overflowBefore.scrollHeight).toBeGreaterThan(overflowBefore.clientHeight)

  await page.mouse.dblclick(before.x + 24, before.y + 3)
  await page.waitForTimeout(250)
  const after = await card.boundingBox()
  if (!after) throw new Error('Missing card geometry')
  expect(after.width !== before.width || after.height !== before.height).toBe(true)

  const fit = await card.evaluate((node) => {
    const body = node.querySelector('.entity-body')
    return body ? { scrollHeight: body.scrollHeight, clientHeight: body.clientHeight } : null
  })
  if (!fit) throw new Error('Missing card body')
  expect(fit.scrollHeight).toBeLessThanOrEqual(fit.clientHeight + 1)
  await page.screenshot({ path: 'test-results/card-autofit.png', fullPage: true })
})

test('opens entity editing with properties expanded and ready', async ({ page }) => {
  await page.goto('/')
  await createCanvas(page)
  await page.getByLabel('Add template').selectOption('system')
  const entity = page.locator('.entity-node')
  const before = await entity.boundingBox()
  await page.locator('.entity-node').dblclick()

  await expect(page.locator('.property-drawer-body')).toBeVisible()
  await expect(page.locator('.entity-content-field .rich-editor-content')).toBeVisible()
  await expect(page.locator('.entity-field input').first()).toBeFocused()
  await page.screenshot({ path: 'test-results/entity-properties-expanded.png', fullPage: true })
  await page.keyboard.press('Escape')
  const after = await entity.boundingBox()
  expect(after).toEqual(before)
})

test('ignores and restores a warning with a reason', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Canvas type').selectOption('systems')
  await createCanvas(page)
  await page.getByLabel('Add template').selectOption('system')
  await page.getByLabel('Add template').selectOption('system')
  await expect(page.locator('.entity-node')).toHaveCount(2)

  await page.getByRole('button', { name: 'Systems validation' }).click()
  const fieldGroup = page.locator('.validation-group').filter({ hasText: 'Missing required field' })
  await fieldGroup.locator('.validation-group-toggle').click()
  const fieldRows = fieldGroup.locator('.validation-item')
  const fieldCount = await fieldRows.count()
  const fieldRow = fieldRows.first()
  await fieldRow.locator('.validation-item-main').click()
  await fieldRow.getByRole('button', { name: 'Ignore this warning' }).click()
  await fieldRow.getByLabel(/Ignore reason/).selectOption('Accepted legacy item')
  await fieldRow.getByRole('button', { name: 'Ignore', exact: true }).click()
  await expect(fieldRows).toHaveCount(fieldCount - 1)

  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'All canvases' }).click()
  await page.locator('.canvas-card').first().click()
  await page.getByRole('button', { name: 'Systems validation' }).click()
  await page.getByRole('button', { name: /Ignored/ }).click()
  await page.locator('.validation-group-toggle').first().click()
  await expect(page.locator('.validation-tray')).toContainText('Ignored: Accepted legacy item')
  await page.locator('.validation-item').getByRole('button', { name: 'Restore' }).click()
  await expect(page.locator('.validation-tray')).toContainText('No ignored warnings')
})
test('suggests a deterministic producer card for an artifact', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Canvas type').selectOption('systems')
  await createCanvas(page)
  await page.getByLabel('Add template').selectOption('artifact')
  await expect(page.locator('.entity-node')).toHaveCount(1)

  await page.getByRole('button', { name: 'Canvas intelligence' }).click()
  const suggestion = page.locator('.validation-suggestion-card').filter({ hasText: 'Add missing artifact producers' })
  await expect(suggestion).toContainText('1')
  await suggestion.locator('.validation-suggestion-toggle').click()
  const item = suggestion.locator('.validation-suggestion-item').first()
  await expect(item).toContainText('Untitled artifact')
  await item.getByRole('button', { name: 'Show' }).click()
  await expect(page.locator('.validation-panel')).toBeVisible()
  await expect(page.locator('.entity-node')).toHaveCount(1)
  await item.getByRole('button', { name: 'Fix', exact: true }).click()

  await expect(page.locator('.validation-panel')).toHaveCount(0)
  await expect(page.locator('.entity-node')).toHaveCount(2)
  await expect(page.locator('.entity-type')).toContainText(['Artifact', 'System'])
  await expect(page.locator('.edge-label')).toContainText('produces')
})

test('separates canvas intelligence from the warnings panel', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Canvas type').selectOption('systems')
  await createCanvas(page)
  await page.getByLabel('Add template').selectOption('artifact')

  await page.getByRole('button', { name: 'Canvas intelligence' }).click()
  await expect(page.getByRole('heading', { name: 'Suggested fixes' })).toBeVisible()
  await expect(page.locator('.validation-group')).toHaveCount(0)
  await page.getByRole('button', { name: 'Close canvas intelligence' }).click()

  await page.getByRole('button', { name: 'Systems validation' }).click()
  await expect(page.getByRole('heading', { name: 'Warnings' })).toBeVisible()
  await expect(page.locator('.validation-suggestion-card')).toHaveCount(0)
  await expect(page.locator('.validation-group')).toHaveCount(2)
})


test('links a new canvas from any card and navigates back', async ({ page }) => {
  await page.goto('/')
  await createCanvas(page, 'Link parent')
  await page.getByRole('button', { name: 'Add card' }).click()

  await page.getByRole('button', { name: 'Manage linked canvases' }).click()
  const dialog = page.getByRole('dialog', { name: 'Linked canvases' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Create new canvas' }).click()
  const createDialog = page.getByRole('dialog', { name: 'Create linked canvas' })
  await createDialog.getByLabel('Canvas name').fill('Linked notes')
  await createDialog.getByRole('button', { name: 'Create and link' }).click()

  await expect(dialog).toContainText('Linked notes')
  await dialog.getByRole('button', { name: 'Open Linked notes' }).click()
  await expect(page.getByRole('heading', { name: 'Linked notes', level: 1 })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Canvas trail' })).toContainText('Link parent')

  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page.getByRole('heading', { name: 'Link parent', level: 1 })).toBeVisible()
  await page.getByRole('button', { name: 'Manage linked canvases' }).click()
  await expect(page.getByRole('dialog', { name: 'Linked canvases' })).toContainText('Linked notes')
})

test('links an existing canvas from a card', async ({ page }) => {
  await page.goto('/')
  await createCanvas(page, 'Existing target')
  await page.getByRole('button', { name: 'All canvases' }).click()
  await createCanvas(page, 'Source parent')
  await page.getByRole('button', { name: 'Add card' }).click()

  await page.getByRole('button', { name: 'Manage linked canvases' }).click()
  const dialog = page.getByRole('dialog', { name: 'Linked canvases' })
  await dialog.getByLabel('Search canvases').fill('Existing target')
  const candidate = dialog.locator('.link-candidate').filter({ hasText: 'Existing target' })
  await candidate.getByRole('button', { name: 'Link' }).click()
  await dialog.getByRole('button', { name: 'Done' }).click()

  await expect(page.getByRole('button', { name: 'Manage linked canvases' })).toHaveClass(/has-links/)
})

test('creates a process card with a linked documentation canvas', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Canvas type').selectOption('systems')
  await createCanvas(page, 'Process parent')
  await page.getByLabel('Add template').selectOption('process-canvas')
  await expect(page.locator('.entity-node')).toHaveCount(1)
  await expect(page.locator('.entity-type')).toHaveText('Process')

  await page.getByRole('button', { name: 'Manage linked canvases' }).click()
  const dialog = page.getByRole('dialog', { name: 'Linked canvases' })
  await expect(dialog).toContainText('Process documentation')
  await dialog.getByRole('button', { name: 'Open Process documentation' }).click()
  await expect(page.getByRole('heading', { name: 'Process documentation', level: 1 })).toBeVisible()
  await expect(page.locator('.entity-node')).toHaveCount(4)
  await expect(page.locator('.entity-type')).toContainText(['Note'])
})
