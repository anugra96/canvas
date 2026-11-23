import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { expect, test, type Page } from '@playwright/test'
import { addCanvasItem, runCanvasCommand, createCanvas, waitForSaved } from './helpers'

interface SavedCanvasNode {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  app?: { groupMembers?: string[] }
}

async function downloadCanvas(page: Page): Promise<{ nodes: SavedCanvasNode[] }> {
  const downloadPromise = page.waitForEvent('download')
  await runCanvasCommand(page, 'Download .canvas')
  const path = await (await downloadPromise).path()
  if (!path) throw new Error('Missing downloaded canvas file')
  return JSON.parse(readFileSync(path, 'utf8')) as { nodes: SavedCanvasNode[] }
}

function inside(
  card: SavedCanvasNode,
  group: SavedCanvasNode,
): boolean {
  return card.x >= group.x
    && card.y >= group.y
    && card.x + card.width <= group.x + group.width
    && card.y + card.height <= group.y + group.height
}

function overlaps(left: SavedCanvasNode, right: SavedCanvasNode): boolean {
  return left.x < right.x + right.width
    && right.x < left.x + left.width
    && left.y < right.y + right.height
    && right.y < left.y + left.height
}

function savedPositions(canvas: { nodes: SavedCanvasNode[] }): Array<{
  id: string
  x: number
  y: number
  width: number
  height: number
}> {
  return [...canvas.nodes]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((node) => ({ id: node.id, x: node.x, y: node.y, width: node.width, height: node.height }))
}

test('creates a canvas, edits a card, saves, and reopens it', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Canvases', exact: true })).toBeVisible()

  await createCanvas(page)
  await expect(page.getByRole('heading', { name: 'Untitled canvas', level: 1 })).toBeVisible()
  await expect(page.getByLabel('Review mode')).toHaveCount(0)

  await addCanvasItem(page, 'Text card')
  await expect(page.locator('.text-node')).toHaveCount(1)
  await page.locator('.node-text').dblclick()
  await page.locator('.rich-editor-content').fill('E2E card')
  await page.keyboard.press('Escape')
  await expect(page.locator('.text-node')).toContainText('E2E card')

  await waitForSaved(page)
  await page.screenshot({ path: 'test-results/canvas-editor.png', fullPage: true })

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Untitled canvas', level: 1 })).toBeVisible()
  await expect(page.locator('.text-node')).toContainText('E2E card')
})

test('keeps the open canvas in the URL and deletes a canvas from the list', async ({ page }) => {
  await page.goto('/')
  await createCanvas(page, 'Routed board')
  await expect(page).toHaveURL(/\/canvas\/[A-Za-z0-9_-]+$/)
  const canvasUrl = page.url()

  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Canvases', exact: true })).toBeVisible()
  await page.goto(canvasUrl)
  await expect(page.getByRole('heading', { name: 'Routed board', level: 1 })).toBeVisible()

  await page.getByRole('button', { name: 'All canvases' }).click()
  await page.getByLabel('Search canvases').fill('routed')
  const card = page.locator('.canvas-card').filter({ hasText: 'Routed board' })
  await expect(page.locator('.canvas-card')).toHaveCount(1)

  await card.getByRole('button', { name: 'Delete Routed board' }).click()
  await page.getByRole('alertdialog', { name: 'Delete canvas' }).getByRole('button', { name: 'Delete canvas' }).click()
  await expect(card).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.canvas-card').filter({ hasText: 'Routed board' })).toHaveCount(0)
})

test('names a new canvas and renames it from the editor and list', async ({ page }) => {
  await page.goto('/')
  await createCanvas(page, 'Named board')
  await expect(page.getByRole('heading', { name: 'Named board', level: 1 })).toBeVisible()

  await page.getByRole('button', { name: 'Rename canvas' }).click()
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
  await addCanvasItem(page, 'Repository')
  await expect(page.locator('.entity-node')).toHaveCount(1)

  await page.locator('.entity-node').dblclick()
  await page.locator('.entity-field input').first().fill('Canvas Engine')
  await expect(page.locator('.entity-head strong')).toContainText('Canvas Engine')
  await page.getByRole('button', { name: 'Done' }).click()

  await waitForSaved(page)
  await page.screenshot({ path: 'test-results/entity-card.png', fullPage: true })
})

test('downloads unsaved edits instead of the last saved copy', async ({ page }) => {
  await page.goto('/')
  await createCanvas(page)
  await addCanvasItem(page, 'Repository')
  await page.locator('.entity-node').dblclick()
  await page.getByLabel('Name', { exact: true }).fill('Fresh edit')
  await page.getByRole('button', { name: 'Done' }).click()

  const downloadPromise = page.waitForEvent('download')
  await runCanvasCommand(page, 'Download .canvas')
  const path = await (await downloadPromise).path()
  if (!path) throw new Error('Missing downloaded canvas file')
  const canvas = JSON.parse(readFileSync(path, 'utf8')) as { nodes: { app?: { fields?: { name?: string } } }[] }
  expect(canvas.nodes.map((node) => node.app?.fields?.name)).toEqual(['Fresh edit'])
})


test('creates a Systems canvas with typed cards and profile persistence', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Canvas type').selectOption('systems')
  await createCanvas(page)

  await expect(page.locator('.profile-badge')).toHaveText('Systems')
  await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeVisible()

  await addCanvasItem(page, 'Actor')
  await addCanvasItem(page, 'System')
  await addCanvasItem(page, 'System')
  await addCanvasItem(page, 'Note')
  await expect(page.locator('.entity-node')).toHaveCount(4)
  await expect(page.locator('.entity-type')).toContainText(['Actor', 'System', 'Note'])

  await page.getByRole('button', { name: /Review/ }).click()
  const panel = page.locator('.review-panel')
  await panel.getByLabel('Review mode').selectOption('Publish')
  await panel.getByRole('button', { name: 'Close review' }).click()
  await expect(page.locator('.canvas-warning-badge').first()).toBeVisible()

  await waitForSaved(page)
  await page.screenshot({ path: 'test-results/systems-canvas.png', fullPage: true })

  await page.getByRole('button', { name: 'All canvases' }).click()
  await expect(page.locator('.canvas-card').first()).toContainText('Systems')
  await page.locator('.canvas-card').first().click()
  await expect(page.locator('.profile-badge')).toHaveText('Systems')
  await expect(page.locator('.entity-node')).toHaveCount(4)
})

test('allows an untyped connection between arbitrary cards', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Canvas type').selectOption('systems')
  await createCanvas(page)
  await addCanvasItem(page, 'Repository')
  await addCanvasItem(page, 'System')
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
  await expect(page.locator('.canvas-warning-badge').first()).toBeVisible()
})

test('connects selected cards from the toolbar without dragging', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Canvas type').selectOption('systems')
  await createCanvas(page)
  await addCanvasItem(page, 'Repository')
  await addCanvasItem(page, 'System')
  await expect(page.locator('.entity-node')).toHaveCount(2)
  await page.waitForTimeout(300)

  const repository = page.locator('.react-flow__node').filter({ hasText: 'Repository' })
  const system = page.locator('.react-flow__node').filter({ hasText: 'System' })
  await repository.click()
  await page.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Click a card', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Click a card', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Connect', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Click a card', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await system.click()

  const relation = page.getByLabel('Edge relation', { exact: true })
  await expect(relation).toBeVisible()
  await relation.selectOption('uses')
  await expect(page.locator('.react-flow__edge')).toHaveCount(1)
  await expect(page.locator('.edge-label')).toContainText('uses')
  await expect(page.locator('.edge-warning-badge')).toHaveCount(0)
})

test('shows only the Systems card types in the Add menu', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Canvas type').selectOption('systems')
  await createCanvas(page)
  await addCanvasItem(page, 'Artifact')
  await expect(page.locator('.entity-type')).toHaveText('Artifact')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  const addItems = await page.getByRole('menu', { name: 'Add commands' }).getByRole('menuitem').allInnerTexts()
  expect(addItems.sort()).toEqual(['Actor', 'Artifact', 'Note', 'Repository', 'Schema', 'System'])
  await page.keyboard.press('Escape')
})

test('shows the note name and kind in the card header', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Canvas type').selectOption('systems')
  await createCanvas(page)
  await addCanvasItem(page, 'Note')
  await expect(page.locator('.note-kind')).toHaveText('Note')
  await page.locator('.entity-node').dblclick()
  await page.locator('[data-field-key="name"]').fill('Review note')
  await page.locator('.entity-content-field .rich-editor-content').fill('This is the note body.')
  await page.locator('[data-field-key="kind"]').selectOption('risk')
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.locator('.entity-head strong')).toHaveText('Review note')
  await expect(page.locator('.note-kind')).toHaveText('Risk')
  await expect(page.locator('.note-kind')).toHaveClass(/note-kind-risk/)
  await expect(page.locator('.entity-content-preview')).toContainText('This is the note body.')
})

test('adds a highlighted code card', async ({ page }) => {
  await page.goto('/')
  await createCanvas(page)
  await addCanvasItem(page, 'Code')
  await expect(page.locator('.code-node')).toHaveCount(1)

  await page.locator('.code-node').dblclick()
  await expect(page.locator('.property-drawer-body')).toHaveCount(0)
  await expect(page.locator('.code-input')).toBeFocused()
  await page.locator('.code-input').fill('const answer: number = 42')
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.locator('.code-node')).toContainText('const answer: number = 42')

  await waitForSaved(page)
  await page.screenshot({ path: 'test-results/code-card.png', fullPage: true })
})

test('supports undo, redo, duplicate, and the shortcuts dialog', async ({ page }) => {
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
  await page.goto('/')
  await createCanvas(page)
  await addCanvasItem(page, 'Text card')
  await expect(page.locator('.text-node')).toHaveCount(1)

  await page.waitForTimeout(400)
  await page.keyboard.press(`${modifier}+z`)
  await expect(page.locator('.text-node')).toHaveCount(0)

  await page.keyboard.press(`${modifier}+Shift+z`)
  await expect(page.locator('.text-node')).toHaveCount(1)

  await page.locator('.text-node').click()
  await page.keyboard.press(`${modifier}+d`)
  await expect(page.locator('.text-node')).toHaveCount(2)

  await runCanvasCommand(page, 'Keyboard shortcuts')
  await expect(page.getByRole('dialog')).toContainText('Undo')
  await expect(page.getByRole('dialog')).toContainText('Zoom to fit')
  await expect(page.getByRole('dialog')).toContainText('Duplicate selection')
  await expect(page.getByRole('dialog')).toContainText('Nudge selection')
  await expect(page.getByRole('dialog')).toContainText('Clear selection or close menu')
  await page.screenshot({ path: 'test-results/shortcuts-dialog.png', fullPage: true })
  await page.getByRole('button', { name: 'Close keyboard shortcuts' }).click()
})

test('creates a card by dragging an edge to empty space and labels the edge', async ({ page }) => {
  await page.goto('/')
  await createCanvas(page)
  await addCanvasItem(page, 'Text card')
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
  await addCanvasItem(page, 'Text card')
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
  await addCanvasItem(page, 'Text card')
  await addCanvasItem(page, 'Text card')
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
  await addCanvasItem(page, 'Text card')
  await page.locator('.selection-toolbar').getByRole('button', { name: 'Group' }).click()
  await expect(page.locator('.group-node')).toHaveCount(1)

  await addCanvasItem(page, 'Text card')
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
  await addCanvasItem(page, 'Text card')

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
  await addCanvasItem(page, 'Text card')
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
  await addCanvasItem(page, 'Text card')
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
  await addCanvasItem(page, 'Text card')
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
  await addCanvasItem(page, 'Text card')
  await addCanvasItem(page, 'Text card')
  await page.keyboard.press(`${modifier}+a`)
  await page.locator('.selection-toolbar').getByRole('button', { name: 'Group' }).click()

  await addCanvasItem(page, 'Text card')
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
  await addCanvasItem(page, 'Repository')
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
  await addCanvasItem(page, 'Repository')
  await page.locator('.entity-node').dblclick()
  await page.locator('.entity-field input').first().fill('Shared model')
  const pane = await page.locator('.canvas-flow').boundingBox()
  if (!pane) throw new Error('Missing canvas pane')
  await page.mouse.click(pane.x + 30, pane.y + 30)
  await expect(page.locator('.entity-head strong')).toContainText('Shared model')

  await page.locator('.entity-node').click()
  await expect(page.locator('.selection-toolbar')).toContainText('1 selected')
  await page.locator('.selection-toolbar').getByRole('combobox', { name: 'Card type' }).selectOption('system')
  await expect(page.locator('.entity-type')).toHaveText('System')
  await expect(page.locator('.entity-head strong')).toContainText('Shared model')
  await page.screenshot({ path: 'test-results/card-type-change.png', fullPage: true })
})

test('drags a card on the first pointer gesture without entering edit mode', async ({ page }) => {
  await page.goto('/')
  await createCanvas(page)
  await addCanvasItem(page, 'Text card')
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
  await addCanvasItem(page, 'Text card')
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
  await addCanvasItem(page, 'Code')
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
  await addCanvasItem(page, 'Text card')
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
  await addCanvasItem(page, 'System')
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
  await addCanvasItem(page, 'System')
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

test('links a new canvas from any card and navigates back', async ({ page }) => {
  await page.goto('/')
  await createCanvas(page, 'Link parent')
  await addCanvasItem(page, 'Text card')

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
  await addCanvasItem(page, 'Text card')

  await page.getByRole('button', { name: 'Manage linked canvases' }).click()
  const dialog = page.getByRole('dialog', { name: 'Linked canvases' })
  await dialog.getByLabel('Search canvases').fill('Existing target')
  const candidate = dialog.locator('.link-candidate').filter({ hasText: 'Existing target' })
  await candidate.getByRole('button', { name: 'Link' }).click()
  await dialog.getByRole('button', { name: 'Done' }).click()

  await expect(page.getByRole('button', { name: 'Manage linked canvases' })).toHaveClass(/has-links/)
})

test('derives focused graph views and a job sequence', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(async () => {
    const response = await fetch('/v1/canvases/import', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer local-dev',
      },
      body: JSON.stringify({
        title: 'Derived views test',
        canvas: {
          app: { profile: 'systems', profileVersion: 4, scope: 'container' },
          nodes: [
            { id: 'actor', type: 'text', x: 0, y: 0, width: 260, height: 120, text: '## Actor: Actor', app: { entityType: 'actor', fields: { name: 'Actor', kind: 'role' } } },
            { id: 'job', type: 'text', x: 340, y: 0, width: 260, height: 140, text: '## System: Job', app: { entityType: 'system', fields: { name: 'Job', kind: 'job' } } },
            { id: 'system', type: 'text', x: 680, y: 0, width: 260, height: 140, text: '## System: System', app: { entityType: 'system', fields: { name: 'System', kind: 'service' } } },
            { id: 'artifact', type: 'text', x: 680, y: 220, width: 260, height: 140, text: '## Artifact: Artifact', app: { entityType: 'artifact', fields: { name: 'Artifact', kind: 'model' } } },
          ],
          edges: [
            { id: 'uses-actor', fromNode: 'actor', toNode: 'job', fromSide: 'right', toSide: 'left', toEnd: 'arrow', app: { relationType: 'uses' } },
            { id: 'uses', fromNode: 'job', toNode: 'system', fromSide: 'right', toSide: 'left', toEnd: 'arrow', app: { relationType: 'uses' } },
            { id: 'produces', fromNode: 'job', toNode: 'artifact', fromSide: 'bottom', toSide: 'top', toEnd: 'arrow', app: { relationType: 'produces' } },
          ],
        },
      }),
    })
    if (!response.ok) throw new Error('Could not seed the derived views canvas.')
  })
  await page.reload()
  await page.locator('.canvas-card').filter({ hasText: 'Derived views test' }).getByRole('button', { name: /^Open / }).click()
  await expect(page.locator('.entity-node')).toHaveCount(4)

  await page.getByRole('button', { name: 'Views' }).click()
  const dialog = page.getByRole('dialog', { name: 'Derived views' })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.derived-card')).toHaveCount(2)
  await expect(dialog.locator('.derived-card')).toContainText(['Actor', 'System'])

  await dialog.getByRole('button', { name: '2 Containers' }).click()
  await expect(dialog.locator('.derived-card')).toHaveCount(4)
  await expect(dialog.locator('.derived-card')).toContainText(['Actor', 'Job', 'System', 'Artifact'])

  await dialog.getByRole('tab', { name: 'Runtime' }).click()
  await expect(dialog.locator('.derived-card')).toHaveCount(4)
  await expect(dialog.locator('.derived-edge-label')).toContainText(['uses', 'produces'])

  await dialog.getByRole('tab', { name: 'Contracts' }).click()
  await expect(dialog.getByText('No cards match this view.')).toBeVisible()

  await dialog.getByRole('tab', { name: 'Sequence' }).click()
  await expect(dialog.getByLabel('Sequence job')).toHaveCount(1)
  await expect(dialog.locator('.derived-participant')).toHaveCount(4)
  await expect(dialog.locator('.derived-message-label')).toContainText(['uses', 'produces'])
  await expect(dialog).toContainText('Inferred order')

  await dialog.getByRole('button', { name: 'Close derived views' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('.entity-node')).toHaveCount(4)
})

test('changes a selected edge relation from the selection toolbar and undo restores it', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Canvas type').selectOption('systems')
  await createCanvas(page)
  await addCanvasItem(page, 'System')
  await addCanvasItem(page, 'System')
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
  await page.waitForTimeout(350)

  const label = await page.locator('.edge-label').boundingBox()
  if (!label) throw new Error('Missing edge label')
  await page.mouse.click(label.x + label.width / 2, label.y + label.height / 2)
  const relation = page.getByLabel('Edge relation')
  await expect(relation).toHaveValue('')
  await relation.selectOption('uses')
  await expect(page.locator('.edge-label')).toContainText('uses')
  await page.waitForTimeout(350)

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.locator('.edge-label')).toContainText('Define relation')
})

test('ignores and restores a warning with a reason', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Canvas type').selectOption('systems')
  await createCanvas(page)
  await addCanvasItem(page, 'System')
  await addCanvasItem(page, 'System')
  await expect(page.locator('.entity-node')).toHaveCount(2)

  await page.getByRole('button', { name: /Review/ }).click()
  const panel = page.locator('.review-panel')
  await expect(panel.getByRole('tab', { name: /Issues/ })).toHaveAttribute('aria-selected', 'true')
  await panel.getByLabel('Review mode').selectOption('Publish')
  const fieldGroup = panel.locator('.validation-group').filter({ hasText: 'Missing required field' })
  await fieldGroup.locator('.validation-group-toggle').click()
  const fieldRows = fieldGroup.locator('.validation-item')
  const fieldCount = await fieldRows.count()
  const fieldRow = fieldRows.first()
  await fieldRow.locator('.validation-item-main').click()
  await fieldRow.getByRole('button', { name: 'Ignore this warning' }).click()
  await fieldRow.getByLabel(/Ignore reason/).selectOption('Accepted legacy item')
  await fieldRow.getByRole('button', { name: 'Ignore', exact: true }).click()
  await expect(fieldRows).toHaveCount(fieldCount - 1)

  await waitForSaved(page)
  await page.getByRole('button', { name: 'All canvases' }).click()
  await page.locator('.canvas-card').first().click()
  await page.getByRole('button', { name: /Review/ }).click()
  await panel.getByRole('button', { name: /Ignored/ }).click()
  await panel.locator('.validation-group-toggle').first().click()
  await expect(panel).toContainText('Ignored: Accepted legacy item')
  await panel.locator('.validation-item').getByRole('button', { name: 'Restore' }).click()
  await expect(panel).toContainText('No ignored warnings')
})

test('suggests a deterministic producer card for an artifact', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Canvas type').selectOption('systems')
  await createCanvas(page)
  await addCanvasItem(page, 'Artifact')
  await expect(page.locator('.entity-node')).toHaveCount(1)
  await page.waitForTimeout(400)

  await page.getByRole('button', { name: /Review/ }).click()
  const panel = page.locator('.review-panel')
  await panel.getByRole('tab', { name: /Fixes/ }).click()
  const suggestion = panel.locator('.validation-suggestion-card').filter({ hasText: 'Add missing artifact producers' })
  await expect(suggestion).toContainText('1')
  await suggestion.locator('.validation-suggestion-toggle').click()
  const item = suggestion.locator('.validation-suggestion-item').first()
  await expect(item).toContainText('Untitled artifact')
  await item.getByRole('button', { name: 'Show' }).click()
  await expect(panel).toBeVisible()
  await expect(page.locator('.entity-node')).toHaveCount(1)
  await item.getByRole('button', { name: 'Fix', exact: true }).click()

  await expect(panel).toHaveCount(0)
  await expect(page.locator('.entity-node')).toHaveCount(2)
  await expect(page.locator('.entity-type')).toContainText(['Artifact', 'System'])
  await expect(page.locator('.edge-label')).toContainText('produces')

  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.locator('.entity-node')).toHaveCount(1)
  await expect(page.locator('.edge-label')).toHaveCount(0)
})

test('navigates review tabs with arrow, home, and end keys', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Canvas type').selectOption('systems')
  await createCanvas(page)
  await addCanvasItem(page, 'Artifact')

  await page.getByRole('button', { name: /Review/ }).click()
  const panel = page.locator('.review-panel')
  const issuesTab = panel.getByRole('tab', { name: /Issues/ })
  const fixesTab = panel.getByRole('tab', { name: /Fixes/ })
  await expect(issuesTab).toHaveAttribute('aria-selected', 'true')
  await expect(issuesTab).toHaveAttribute('tabindex', '0')
  await expect(fixesTab).toHaveAttribute('tabindex', '-1')

  await issuesTab.focus()
  await page.keyboard.press('ArrowRight')
  await expect(fixesTab).toBeFocused()
  await expect(fixesTab).toHaveAttribute('aria-selected', 'true')
  await expect(fixesTab).toHaveAttribute('tabindex', '0')

  await page.keyboard.press('ArrowLeft')
  await expect(issuesTab).toBeFocused()
  await page.keyboard.press('End')
  await expect(fixesTab).toBeFocused()
  await page.keyboard.press('Home')
  await expect(issuesTab).toBeFocused()
})

test('merges issues and fixes in one review panel and remembers the tab', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Canvas type').selectOption('systems')
  await createCanvas(page)
  await addCanvasItem(page, 'Artifact')
  await expect(page.locator('.entity-node')).toHaveCount(1)

  await page.locator('.canvas-warning-badge').first().click()
  const panel = page.locator('.review-panel')
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('tab', { name: /Issues/ })).toHaveAttribute('aria-selected', 'true')
  await panel.getByRole('button', { name: 'Close review' }).click()

  await page.getByRole('button', { name: /Review/ }).click()
  await panel.getByRole('tab', { name: /Fixes/ }).click()
  await expect(panel.getByRole('tab', { name: /Fixes/ })).toHaveAttribute('aria-selected', 'true')
  await panel.getByRole('button', { name: 'Close review' }).click()

  await page.getByRole('button', { name: /Review/ }).click()
  await expect(panel.getByRole('tab', { name: /Fixes/ })).toHaveAttribute('aria-selected', 'true')
  const suggestion = panel.locator('.validation-suggestion-card').filter({ hasText: 'Add missing artifact producers' })
  await suggestion.locator('.validation-suggestion-toggle').click()
  await suggestion.getByRole('button', { name: 'Fix', exact: true }).click()
  await expect(panel).toHaveCount(0)
  await expect(page.locator('.entity-node')).toHaveCount(2)
  await expect(page.locator('.edge-label')).toContainText('produces')
})

test('replan preview keeps grouped systems inside the group and undo restores positions', async ({ page }) => {
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
  await page.goto('/')
  await page.getByLabel('Canvas type').selectOption('systems')
  await createCanvas(page, 'Urban planner')
  await addCanvasItem(page, 'System')
  await addCanvasItem(page, 'System')
  await expect(page.locator('.entity-node')).toHaveCount(2)
  await page.waitForTimeout(400)

  const nodes = page.locator('.react-flow__node')
  const from = await nodes.nth(0).locator('.react-flow__handle-right').boundingBox()
  const to = await nodes.nth(1).locator('.react-flow__handle-left').boundingBox()
  if (!from || !to) throw new Error('Missing connection handles')
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 })
  await page.mouse.up()
  await page.getByLabel('Edge relation', { exact: true }).selectOption('uses')
  await expect(page.locator('.react-flow__edge')).toHaveCount(1)
  await page.waitForTimeout(300)

  await page.keyboard.press(`${modifier}+a`)
  await page.locator('.selection-toolbar').getByRole('button', { name: 'Group' }).click()
  await expect(page.locator('.group-node')).toHaveCount(1)

  await addCanvasItem(page, 'System')
  await expect(page.locator('.entity-node')).toHaveCount(3)
  const outside = page.locator('.entity-node').nth(2)
  const outsideBox = await outside.boundingBox()
  if (!outsideBox) throw new Error('Missing outside card')
  await page.mouse.move(outsideBox.x + 40, outsideBox.y + 30)
  await page.mouse.down()
  await page.mouse.move(outsideBox.x + 260, outsideBox.y + 190, { steps: 12 })
  await page.mouse.up()

  await waitForSaved(page)
  const before = await downloadCanvas(page)
  const groupBefore = before.nodes.find((node) => node.type === 'group')
  expect(groupBefore?.app?.groupMembers).toHaveLength(2)

  const preview = page.getByRole('region', { name: 'Layout preview' })
  await runCanvasCommand(page, 'Replan layout')
  await expect(preview).toBeVisible()
  await expect(preview).toContainText(/\d+ cards? move/)
  await preview.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(preview).toHaveCount(0)
  await waitForSaved(page)
  expect(savedPositions(await downloadCanvas(page))).toEqual(savedPositions(before))

  await runCanvasCommand(page, 'Replan layout')
  await expect(preview).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(preview).toHaveCount(0)
  await waitForSaved(page)
  expect(savedPositions(await downloadCanvas(page))).toEqual(savedPositions(before))

  await runCanvasCommand(page, 'Replan layout')
  await expect(preview).toBeVisible()
  await expect(preview).toContainText(/[1-9]\d* cards? move/)
  await preview.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(preview).toHaveCount(0)
  await expect(page.locator('.editor-notice')).toContainText(/Layout applied: [1-9]\d* cards? moved\./)
  await waitForSaved(page)
  const after = await downloadCanvas(page)
  const group = after.nodes.find((node) => node.type === 'group')
  if (!group) throw new Error('Missing group after replan')
  const members = new Set(group.app?.groupMembers ?? [])
  expect(members.size).toBe(2)

  for (const id of members) {
    const member = after.nodes.find((node) => node.id === id)
    if (!member) throw new Error('Missing group member after replan')
    expect(inside(member, group)).toBe(true)
  }

  const cards = after.nodes.filter((node) => node.type !== 'group')
  for (let leftIndex = 0; leftIndex < cards.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < cards.length; rightIndex += 1) {
      expect(overlaps(cards[leftIndex]!, cards[rightIndex]!)).toBe(false)
    }
  }
  for (const card of cards) {
    if (!members.has(card.id)) expect(overlaps(card, group)).toBe(false)
  }

  const beforeById = new Map(before.nodes.map((node) => [node.id, node]))
  expect(after.nodes.some((node) => {
    const previous = beforeById.get(node.id)
    return previous && (previous.x !== node.x || previous.y !== node.y)
  })).toBe(true)

  await page.getByRole('button', { name: 'Undo' }).click()
  await waitForSaved(page)
  expect(savedPositions(await downloadCanvas(page))).toEqual(savedPositions(before))
})

test('makes a district with an owner and undo returns a plain group', async ({ page }) => {
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
  await page.goto('/')
  await page.getByLabel('Canvas type').selectOption('systems')
  await createCanvas(page, 'Zoned payments')

  await addCanvasItem(page, 'Actor')
  await page.locator('.react-flow__node.selected').dblclick()
  await page.getByLabel('Name', { exact: true }).fill('Finance team')
  await page.getByRole('button', { name: 'Done' }).click()
  await addCanvasItem(page, 'System')
  await page.locator('.react-flow__node.selected').dblclick()
  await page.getByLabel('Name', { exact: true }).fill('Payments API')
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.locator('.entity-node')).toHaveCount(2)

  await page.keyboard.press(`${modifier}+a`)
  await page.locator('.selection-toolbar').getByRole('button', { name: 'Group' }).click()
  const group = page.locator('.group-node')
  await expect(group).toHaveCount(1)
  await page.waitForTimeout(400)

  async function selectGroup() {
    const box = await group.boundingBox()
    if (!box) throw new Error('Missing group geometry')
    await page.mouse.click(box.x + 10, box.y + box.height / 2)
    await expect(page.locator('.selection-toolbar')).toContainText('1 selected')
  }

  await selectGroup()
  const districtButton = page.getByRole('button', { name: 'District', exact: true })
  await expect(districtButton).toHaveAttribute('aria-pressed', 'false')
  await districtButton.click()
  await expect(districtButton).toHaveAttribute('aria-pressed', 'true')
  await page.waitForTimeout(400)

  await page.getByRole('button', { name: /Review/ }).click()
  const panel = page.locator('.review-panel')
  await panel.getByLabel('Review mode').selectOption('Publish')
  await expect(panel.getByText('District without owner')).toBeVisible()
  await panel.getByRole('button', { name: 'Close review' }).click()

  await expect(page.getByLabel('District owner', { exact: true })).toBeVisible()
  await page.getByLabel('District owner', { exact: true }).selectOption({ label: 'Finance team' })
  await expect(page.locator('.group-label')).toContainText('Finance team')
  await page.waitForTimeout(400)

  await page.getByRole('button', { name: /Review/ }).click()
  await expect(panel.getByText('District without owner')).toHaveCount(0)
  await panel.getByRole('button', { name: 'Close review' }).click()

  await selectGroup()
  await page.getByRole('button', { name: 'Undo' }).click()
  await page.waitForTimeout(400)
  await expect(page.locator('.group-label')).not.toContainText('Finance team')
  await selectGroup()
  await page.getByRole('button', { name: 'Undo' }).click()
  await page.waitForTimeout(400)
  await selectGroup()
  await expect(page.getByRole('button', { name: 'District', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('.group-label')).toHaveText('Group')
})

test('views open fitted to the window, never below half size, and export stays full size', async ({ page }) => {
  const example = fileURLToPath(new URL('../../../examples/model-delivery-exact-layout.canvas', import.meta.url))
  const response = await page.request.post('/v1/canvases/import', {
    headers: { authorization: 'Bearer local-dev' },
    data: { title: 'Views fit', canvas: JSON.parse(readFileSync(example, 'utf8')) },
  })
  expect(response.ok()).toBe(true)
  const { id } = await response.json() as { id: string }
  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto(`/canvas/${id}`)
  await page.getByRole('button', { name: 'Views', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Derived views' })
  const graph = dialog.getByRole('img', { name: /derived diagram/ })
  const fit = dialog.getByRole('button', { name: 'Fit to window' })
  await expect(fit).toHaveAttribute('aria-pressed', 'true')

  const width = async () => (await graph.boundingBox())!.width
  await expect.poll(width).toBeLessThan(await graph.evaluate((element) => (element as HTMLElement).offsetWidth))
  const fitted = await width()
  const natural = await graph.evaluate((element) => (element as HTMLElement).offsetWidth)
  expect(fitted).toBeGreaterThanOrEqual(natural * 0.5 - 1)

  const download = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'PNG' }).click()
  const png = readFileSync(await (await download).path())
  expect(png.readUInt32BE(16)).toBeGreaterThan(natural * 2) // 2x pixel ratio of the unscaled surface

  await fit.click()
  await expect.poll(width).toBeCloseTo(natural, 0)
})
