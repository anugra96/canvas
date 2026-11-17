import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import { describe, expect, it } from 'vitest'

import { importDatabaseSql } from './importDatabase'
import { nodeTableDefinition, schemaName, stringField } from './model'

const require = createRequire(import.meta.url)
const wasm = readFileSync(require.resolve('libpg-query/wasm/libpg-query.wasm'))
const source = readFileSync(new URL('./fixtures/pg-dump-synthetic.sql', import.meta.url), 'utf8')

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
})
