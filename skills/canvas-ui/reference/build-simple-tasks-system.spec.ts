import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Locator, type Page } from '@playwright/test'

// Reference for skills/canvas-ui: builds a small Systems canvas entirely through the UI.
// Run against an isolated app (see SKILL.md) with a Playwright config whose baseURL is that app.
// Output: <CANVAS_UI_OUT or test-results>/simple-tasks-system.canvas

type CardType = 'System' | 'Repository' | 'Actor' | 'Artifact' | 'Schema' | 'Note'
type Card = { type: CardType; name: string; kind?: string; owner?: string; url?: string; version?: string; uri?: string; text?: string }

const CARDS: Card[] = [
  { type: 'Actor', name: 'Task user', kind: 'person', text: 'Plans and tracks work.' },
  { type: 'System', name: 'Tasks web', kind: 'service', owner: 'Web team', text: 'Browser UI for tasks.' },
  { type: 'System', name: 'Tasks API', kind: 'api', owner: 'Platform', url: 'https://api.example.test/v1', text: 'HTTP API for tasks.' },
  { type: 'System', name: 'Tasks DB', kind: 'database', owner: 'Platform', text: 'PostgreSQL 16 with schemas app and audit.' },
  { type: 'System', name: 'Reminder job', kind: 'job', owner: 'Platform', text: 'Emails due-date reminders every hour.' },
  { type: 'Repository', name: 'tasks-app', url: 'https://git.example.test/tasks-app', owner: 'Platform', text: 'Monorepo for web, API, and job.' },
  { type: 'Artifact', name: 'tasks-api image', kind: 'container', version: '1.0.0', uri: 'registry.example.test/tasks-api:1.0.0', owner: 'Platform', text: 'Runtime image of Tasks API.' },
  { type: 'Schema', name: 'Task', kind: 'api', version: '1.0.0', owner: 'Platform' },
  { type: 'Note', name: 'Use PostgreSQL 16', kind: 'decision', text: 'One database for app and audit data.' },
]

// [from card, to card, relation]. Direction matters: see recipes/systems.md.
const LINES: [string, string, string][] = [
  ['Actor Task user', 'System Tasks web', 'uses'],
  ['System Tasks web', 'System Tasks API', 'uses'],
  ['System Tasks API', 'System Tasks DB', 'uses'],
  ['System Tasks API', 'System Reminder job', 'uses'],
  ['System Tasks API', 'Repository tasks-app', 'uses'],
  ['Repository tasks-app', 'Artifact tasks-api image', 'produces'],
  ['System Tasks API', 'Schema Task', 'defines'],
  ['Note Use PostgreSQL 16', 'System Tasks DB', 'relates_to'],
]

const card = (page: Page, name: string): Locator => page.getByRole('group', { name, exact: true })

async function addFromMenu(page: Page, item: string) {
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('menuitem', { name: item, exact: true }).click()
}

function editor(page: Page, type: CardType): Locator {
  return page.getByRole('dialog', { name: type === 'Schema' ? 'Edit schema contract' : `Edit ${type}`, exact: true })
}

test('build Simple Tasks system by hand', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New canvas', exact: true }).waitFor()
  await page.getByLabel('Canvas type').selectOption('systems')
  await page.getByRole('button', { name: 'New canvas', exact: true }).click()
  await page.getByRole('dialog').getByLabel('Canvas name').fill('Simple Tasks system (hand-built)')
  await page.getByRole('dialog').getByRole('button', { name: 'Create canvas', exact: true }).click()
  await expect(page).toHaveURL(/\/canvas\//)

  // 1. Cards. A new card is selected: open it at once.
  for (const c of CARDS) {
    await addFromMenu(page, c.type)
    await page.locator('.react-flow__node.selected').last().dblclick()
    const ed = editor(page, c.type)
    await ed.getByLabel('Name', { exact: true }).fill(c.name)
    if (c.kind) await ed.getByRole('combobox', { name: 'Kind', exact: true }).selectOption(c.kind)
    for (const [label, value] of [['Owner', c.owner], ['URL', c.url], ['Version', c.version], ['URI', c.uri]] as const) {
      if (value) await ed.getByLabel(label, { exact: true }).fill(value)
    }
    if (c.text) {
      // Artifact has a plain Purpose field; System, Repository, Actor and Note use the Markdown editor.
      const plain = ed.getByLabel('Purpose', { exact: true })
      if (await plain.count()) await plain.fill(c.text)
      else await ed.getByRole('textbox', { name: 'Markdown preview', exact: true }).fill(c.text)
    }
    await ed.getByRole('button', { name: 'Done', exact: true }).click()
    await expect(card(page, `${c.type} ${c.name}`)).toBeVisible()
  }

  // 2. Lines: select the source card, Connect, click the target, then pick the relation.
  await page.getByRole('button', { name: 'Fit View', exact: true }).click()
  for (const [from, to, relation] of LINES) {
    await page.keyboard.press('Escape')
    await card(page, from).click()
    await page.getByRole('button', { name: 'Connect', exact: true }).click()
    await card(page, to).click()
    await page.getByLabel('Edge relation', { exact: true }).selectOption(relation)
  }

  // 3. Tidy after the lines exist: the layout follows them.
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'More canvas actions', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Tidy layout' }).click()

  // 4. Download and check what was built.
  await page.getByRole('button', { name: 'More canvas actions', exact: true }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: 'Download .canvas' }).click()
  const out = join(process.env.CANVAS_UI_OUT ?? test.info().outputDir, 'simple-tasks-system.canvas')
  await (await download).saveAs(out)

  const doc = JSON.parse(readFileSync(out, 'utf8')) as { nodes: { app?: { entityType?: string; fields?: Record<string, unknown> } }[]; edges: { app?: { relationType?: string } }[] }
  expect(doc.nodes.map((n) => `${n.app?.entityType}:${n.app?.fields?.name}`).sort())
    .toEqual(CARDS.map((c) => `${c.type.toLowerCase()}:${c.name}`).sort())
  expect(doc.edges.map((e) => e.app?.relationType).sort()).toEqual(LINES.map((l) => l[2]).sort())
})
