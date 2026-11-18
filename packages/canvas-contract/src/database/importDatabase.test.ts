import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import { describe, expect, it } from 'vitest'

import { importDatabaseSql } from './importDatabase'
import { nodeTableDefinition, schemaName, stringField } from './model'

const require = createRequire(import.meta.url)
const wasm = readFileSync(require.resolve('libpg-query/wasm/libpg-query.wasm'))
const source = readFileSync(new URL('./fixtures/pg-dump-synthetic.sql', import.meta.url), 'utf8')
const simpleTasksSource = readFileSync(new URL('../../../../examples/simple-tasks-db.sql', import.meta.url), 'utf8')

describe('Database DDL import', () => {
  it('normalises serial to identity and keeps unmodelled statements in source order', async () => {
    const imported = await importDatabaseSql(source, { wasm })
    const event = (imported.canvas.nodes ?? []).find((node) => (
      node.app?.entityType === 'table'
      && stringField(node, 'name') === 'event'
      && schemaName(node) === 'app'
    ))
    expect(event).toBeTruthy()
    const id = nodeTableDefinition(event!)!.columns.find((column) => column.name === 'id')!
    expect(id.identity).toBe('by_default')
    expect(id.default).toBeUndefined()

    const database = (imported.canvas.nodes ?? []).find((node) => (
      node.app?.entityType === 'database_definition'
    ))!
    const extra = stringField(database, 'extra')
    expect(extra).not.toContain('CREATE SEQUENCE')
    expect(extra).toContain('CREATE FUNCTION')
    expect(extra.indexOf('CREATE FUNCTION')).toBeLessThan(extra.indexOf('CREATE TRIGGER'))
    expect(imported.warnings.join('\n')).toContain('Kept')
    expect(imported.warnings.join('\n')).toContain('Extra DDL')
    expect(imported.warnings.join('\n')).toContain('Dropped FK deferrability')
    expect(imported.warnings.join('\n')).toContain('Dropped NOT VALID')
    expect(imported.warnings.join('\n')).toContain('Dropped identity sequence options')
    expect(imported.warnings.join('\n')).toContain('Normalised 1 serial sequence')
  })

  it.each([
    {
      name: 'examples/simple-tasks-db.sql',
      sql: simpleTasksSource,
      expected: [
        ['app', 'comment', 'id'],
        ['app', 'label', 'id'],
        ['audit', 'task_event', 'id'],
      ],
    },
    {
      name: 'a primary key without NOT NULL',
      sql: 'CREATE TABLE public.ledger (entry_id integer, CONSTRAINT ledger_pkey PRIMARY KEY (entry_id));',
      expected: [['public', 'ledger', 'entry_id']],
    },
    {
      name: 'an identity column outside the primary key',
      sql: 'CREATE TABLE public.counter (seq bigint GENERATED ALWAYS AS IDENTITY, code text NOT NULL, CONSTRAINT counter_pkey PRIMARY KEY (code));',
      expected: [['public', 'counter', 'seq']],
    },
  ])('marks identity and primary-key columns NOT NULL in $name', async ({ sql, expected }) => {
    const imported = await importDatabaseSql(sql, { wasm })
    for (const [schema, table, column] of expected) {
      const node = (imported.canvas.nodes ?? []).find((candidate) => (
        candidate.app?.entityType === 'table'
        && stringField(candidate, 'name') === table
        && schemaName(candidate) === schema
      ))
      expect(node, `missing table ${schema}.${table}`).toBeTruthy()
      const definition = nodeTableDefinition(node!)!
      const importedColumn = definition.columns.find((candidate) => candidate.name === column)
      expect(importedColumn?.nullable, `${schema}.${table}.${column} should be NOT NULL`).toBe(false)
    }
  })
})
