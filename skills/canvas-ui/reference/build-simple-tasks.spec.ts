import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page, type Locator } from '@playwright/test'

type Col = { comment?: string; name: string; type: string; nullable?: boolean; default?: string; pk?: boolean; unique?: boolean; identity?: 'always' | 'by_default'; generated?: string }
type Fk = { columns: string; schema: string; table: string; refColumns: string; onDelete?: 'cascade' | 'set_null' | 'restrict' }
type Idx = { name: string; unique?: boolean; columns: string; where?: string }
type Table = { uniques?: { name: string; columns: string }[]; checks?: { name: string; expression: string }[]; schema: string; name: string; description?: string; columns: Col[]; fks?: Fk[]; indexes?: Idx[] }

const now = 'now()'
const uuidPk: Col = { name: 'id', type: 'uuid', default: 'gen_random_uuid()', pk: true }
const idPk: Col = { name: 'id', type: 'bigint', identity: 'always', pk: true }
const ts = (name: string, nullable = false, def?: string): Col => ({ name, type: 'timestamp with time zone', nullable, default: def })

const TABLES: Table[] = [
  { schema: 'app', name: 'account', description: 'A person who signs in', checks: [{ name: 'account_email_check', expression: "position('@' in email) > 1" }], columns: [uuidPk, { name: 'email', type: 'text' }, { name: 'display_name', type: 'text' }, ts('created_at', false, now)],
    indexes: [{ name: 'account_email_lower_key', unique: true, columns: '(lower(email))' }] },
  { schema: 'app', name: 'workspace', checks: [{ name: 'workspace_slug_check', expression: "slug ~ '^[a-z0-9-]{3,40}$'" }], columns: [uuidPk, { name: 'slug', type: 'text', unique: true }, { name: 'name', type: 'text' }, ts('created_at', false, now)] },
  { schema: 'app', name: 'workspace_member', description: 'Who can see a workspace, and with which role', columns: [
    { name: 'workspace_id', type: 'uuid', pk: true }, { name: 'account_id', type: 'uuid', pk: true }, { name: 'role', type: 'app.member_role', default: "'editor'" }, ts('joined_at', false, now)],
    fks: [{ columns: 'workspace_id', schema: 'app', table: 'workspace', refColumns: 'id', onDelete: 'cascade' }, { columns: 'account_id', schema: 'app', table: 'account', refColumns: 'id', onDelete: 'cascade' }] },
  { schema: 'app', name: 'project', columns: [uuidPk, { name: 'workspace_id', type: 'uuid' }, { name: 'name', type: 'text' }, ts('archived_at', true), ts('created_at', false, now)],
    fks: [{ columns: 'workspace_id', schema: 'app', table: 'workspace', refColumns: 'id', onDelete: 'cascade' }],
    uniques: [{ name: 'project_workspace_name_key', columns: 'workspace_id, name' }] },
  { schema: 'app', name: 'task', description: 'One task; the Task schema in the Tasks API', checks: [{ name: 'task_title_check', expression: 'char_length(title) BETWEEN 1 AND 120' }, { name: 'task_estimate_check', expression: 'estimate_minutes IS NULL OR estimate_minutes > 0' }], columns: [uuidPk,
    { name: 'project_id', type: 'uuid' }, { name: 'parent_task_id', type: 'uuid', nullable: true, comment: 'Optional parent for sub-tasks' }, { name: 'assignee_id', type: 'uuid', nullable: true },
    { name: 'title', type: 'text' }, { name: 'status', type: 'app.task_status', default: "'open'" }, { name: 'due_date', type: 'date', nullable: true },
    { name: 'estimate_minutes', type: 'integer', nullable: true }, { name: 'estimate_hours', type: 'numeric(6,2)', nullable: true, generated: '(estimate_minutes / 60.0)' },
    ts('created_at', false, now), ts('updated_at', false, now)],
    fks: [{ columns: 'project_id', schema: 'app', table: 'project', refColumns: 'id', onDelete: 'cascade' }, { columns: 'parent_task_id', schema: 'app', table: 'task', refColumns: 'id', onDelete: 'set_null' }, { columns: 'assignee_id', schema: 'app', table: 'account', refColumns: 'id', onDelete: 'set_null' }],
    indexes: [{ name: 'task_project_status_idx', columns: 'project_id, status' }, { name: 'task_open_due_idx', columns: 'due_date', where: "status <> 'done'" }, { name: 'task_assignee_idx', columns: 'assignee_id' }] },
  { schema: 'app', name: 'label', columns: [idPk, { name: 'workspace_id', type: 'uuid' }, { name: 'name', type: 'text' }, { name: 'color', type: 'text', default: "'#888888'" }],
    fks: [{ columns: 'workspace_id', schema: 'app', table: 'workspace', refColumns: 'id', onDelete: 'cascade' }],
    uniques: [{ name: 'label_workspace_name_key', columns: 'workspace_id, name' }] },
  { schema: 'app', name: 'task_label', columns: [{ name: 'task_id', type: 'uuid', pk: true }, { name: 'label_id', type: 'bigint', pk: true }],
    fks: [{ columns: 'task_id', schema: 'app', table: 'task', refColumns: 'id', onDelete: 'cascade' }, { columns: 'label_id', schema: 'app', table: 'label', refColumns: 'id', onDelete: 'cascade' }] },
  { schema: 'app', name: 'comment', columns: [idPk, { name: 'task_id', type: 'uuid' }, { name: 'author_id', type: 'uuid', nullable: true }, { name: 'body', type: 'text' }, ts('created_at', false, now)],
    fks: [{ columns: 'task_id', schema: 'app', table: 'task', refColumns: 'id', onDelete: 'cascade' }, { columns: 'author_id', schema: 'app', table: 'account', refColumns: 'id', onDelete: 'set_null' }],
    indexes: [{ name: 'comment_task_idx', columns: 'task_id, created_at' }] },
  { schema: 'audit', name: 'task_event', columns: [idPk, { name: 'task_id', type: 'uuid' }, { name: 'actor_id', type: 'uuid', nullable: true }, { name: 'change', type: 'jsonb' }, ts('happened_at', false, now)],
    fks: [{ columns: 'task_id', schema: 'app', table: 'task', refColumns: 'id', onDelete: 'cascade' }],
    indexes: [{ name: 'task_event_task_idx', columns: 'task_id, happened_at' }] },
]

// Reference for skills/canvas-ui: builds examples/simple-tasks-db.sql entirely through the UI.
// Run against an isolated app (see SKILL.md) with a Playwright config whose baseURL is that app.
// Output: <CANVAS_UI_OUT or test-results>/simple-tasks-hand.sql

async function addFromMenu(page: Page, item: string) {
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('menuitem', { name: item, exact: true }).click()
}

function card(page: Page, name: string): Locator {
  return page.locator(`[aria-label="${name}"]`).first()
}

async function openCard(page: Page, node: Locator) {
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Fit View', exact: true }).click()
  await node.dblclick()
}

test('build simple_tasks by hand', async ({ page }) => {
  // 1. Database canvas
  await page.goto('/')
  await page.getByLabel('Canvas type').selectOption('database')
  await page.getByRole('button', { name: 'New canvas', exact: true }).click()
  await page.getByRole('dialog').getByLabel('Canvas name').fill('simple_tasks (hand-built)')
  await page.getByRole('dialog').getByRole('button', { name: 'Create canvas', exact: true }).click()
  await expect(page).toHaveURL(/\/canvas\//)

  // 2. Database settings
  await page.getByRole('button', { name: 'More canvas actions', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Database settings', exact: true }).click()
  await page.getByLabel('Name', { exact: true }).fill('simple_tasks')
  await page.getByLabel('Server version', { exact: true }).fill('16')
  await page.getByLabel('Extensions', { exact: true }).fill('pgcrypto public')
  await page.getByRole('button', { name: 'Save', exact: true }).click()

  // 3. Enums (a new card is selected; open it before anything else changes selection)
  for (const e of [{ name: 'task_status', values: 'open\nin_progress\ndone' }, { name: 'member_role', values: 'owner\neditor\nviewer' }]) {
    await addFromMenu(page, 'Enum')
    await page.locator('.react-flow__node.selected').last().dblclick()
    await page.getByLabel('Name', { exact: true }).fill(e.name)
    await page.getByLabel('Schema', { exact: true }).fill('app')
    await page.getByLabel('Values', { exact: true }).fill(e.values)
    await page.getByRole('button', { name: 'Done', exact: true }).click()
    await expect(card(page, `Enum app.${e.name}`)).toBeVisible()
  }

  // 4. Tables: edit the two starter rows in place, add the rest
  for (const t of TABLES) {
    await addFromMenu(page, 'Table')
    const add = page.getByRole('dialog', { name: 'Add table' })
    await add.getByLabel('Table name').fill(t.name)
    await add.getByLabel('Schema').fill(t.schema)
    await add.getByLabel('Id column').selectOption({ label: t.columns[0]!.type === 'bigint' ? 'bigint identity' : 'uuid default gen_random_uuid()' })
    await add.getByRole('button', { name: 'Add table', exact: true }).click()
    await expect(add).toBeHidden()

    const table = card(page, `Table ${t.schema}.${t.name}`)
    await openCard(page, table)
    const ed = page.getByRole('dialog', { name: 'Edit Table' })
    if (t.description) await ed.getByLabel('Description', { exact: true }).fill(t.description)
    for (const [i, c] of t.columns.entries()) {
      const n = i + 1
      const field = (name: string) => ed.getByLabel(`Column ${n} ${name}`, { exact: true })
      if (!(await field('name').count())) await ed.getByRole('button', { name: 'Add column', exact: true }).first().click()
      await field('name').fill(c.name)
      await field('type').fill(c.type)
      await ed.getByRole('button', { name: `More for ${c.name}`, exact: true }).click()
      await field('identity').selectOption(c.identity ?? '')
      if (!c.identity && (c.default !== undefined || (await field('default').inputValue()) !== '')) {
        await field('default').fill(c.default ?? '')
      }
      if (c.comment) await field('comment').fill(c.comment)
      if (c.generated) await field('generated').fill(c.generated)
      await field('not null').setChecked(!c.nullable)
      await field('primary key').setChecked(!!c.pk)
      await field('unique').setChecked(!!c.unique)
    }
    for (const [i, u] of (t.uniques ?? []).entries()) {
      await ed.getByRole('button', { name: 'Add unique', exact: true }).click()
      await ed.getByLabel(`Unique ${i + 1} name`, { exact: true }).fill(u.name)
      await ed.getByLabel(`Unique ${i + 1} columns`, { exact: true }).fill(u.columns)
    }
    for (const [i, k] of (t.checks ?? []).entries()) {
      await ed.getByRole('button', { name: 'Add check', exact: true }).click()
      await ed.getByLabel(`Check ${i + 1} name`, { exact: true }).fill(k.name)
      await ed.getByLabel(`Check ${i + 1} expression`, { exact: true }).fill(k.expression)
    }
    for (const [i, x] of (t.indexes ?? []).entries()) {
      await ed.getByRole('button', { name: 'Add index', exact: true }).click()
      await ed.getByLabel(`Index ${i + 1} name`, { exact: true }).fill(x.name)
      await ed.getByLabel(`Index ${i + 1} unique`, { exact: true }).setChecked(!!x.unique)
      await ed.getByLabel(`Index ${i + 1} columns`, { exact: true }).fill(x.columns)
      if (x.where) await ed.getByLabel(`Index ${i + 1} where`, { exact: true }).fill(x.where)
    }
    await ed.getByRole('button', { name: 'Done', exact: true }).click()
    await expect(table).toContainText(t.columns.at(-1)!.name)
  }

  // 5. Foreign keys, after every table exists
  for (const t of TABLES) {
    if (!t.fks?.length) continue
    await openCard(page, card(page, `Table ${t.schema}.${t.name}`))
    const ed = page.getByRole('dialog', { name: 'Edit Table' })
    for (const [i, f] of t.fks.entries()) {
      const n = i + 1
      await ed.getByRole('button', { name: 'Add foreign key', exact: true }).click()
      await ed.getByLabel(`Foreign key ${n} columns`, { exact: true }).fill(f.columns)
      await ed.getByLabel(`Foreign key ${n} table`, { exact: true }).selectOption(`${f.schema}.${f.table}`)
      await ed.getByLabel(`Foreign key ${n} referenced columns`, { exact: true }).fill(f.refColumns)
      if (f.onDelete) await ed.getByLabel(`Foreign key ${n} on delete`, { exact: true }).selectOption(f.onDelete)
    }
    await expect(ed.getByRole('alert')).toHaveCount(0)
    await ed.getByRole('button', { name: 'Done', exact: true }).click()
  }

  // 6. Schema descriptions: double-click the lane title, not its body
  for (const [schema, description] of [['app', 'Workspaces, projects, and tasks served by the Tasks API'], ['audit', 'Append-only history of task changes']] as const) {
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Fit View', exact: true }).click()
    await card(page, `Schema ${schema}`).locator('header strong').first().dblclick()
    await page.getByLabel('Description', { exact: true }).fill(description)
    await page.getByRole('button', { name: 'Done', exact: true }).click()
  }

  // 7. Tidy and export
  await page.getByRole('button', { name: 'More canvas actions', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Tidy database layout', exact: true }).click()
  await page.getByRole('button', { name: 'More canvas actions', exact: true }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: 'Export DDL', exact: true }).click()
  const ddl = readFileSync((await (await download).path())!, 'utf8')
  for (const t of TABLES) expect(ddl).toContain(`CREATE TABLE ${t.schema}.${t.name}`)
  expect(ddl).toContain('ON DELETE CASCADE')
  writeFileSync(join(process.env.CANVAS_UI_OUT ?? 'test-results', 'simple-tasks-hand.sql'), ddl)
})
