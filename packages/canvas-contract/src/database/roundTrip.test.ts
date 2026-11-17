import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import { describe, expect, it } from 'vitest'

import type { CanvasNode, JsonCanvas } from '../jsonCanvas'
import { exportDatabaseDdl } from './exportDatabase'
import { importDatabaseSql } from './importDatabase'
import { nodeTableDefinition, schemaName, stringField } from './model'

const require = createRequire(import.meta.url)
const wasm = readFileSync(require.resolve('libpg-query/wasm/libpg-query.wasm'))

const fixtures = [
  'auth-better-auth.sql',
  'order-erd.sql',
  'pg-dump-synthetic.sql',
] as const

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')
}

function definitions(canvas: JsonCanvas): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const node of canvas.nodes ?? []) {
    if (node.app?.entityType !== 'table') continue
    result[`${schemaName(node)}.${stringField(node, 'name')}`] = nodeTableDefinition(node)
  }
  return result
}

function databaseNode(canvas: JsonCanvas): CanvasNode {
  const node = (canvas.nodes ?? []).find((candidate) => candidate.app?.entityType === 'database_definition')
  if (!node) throw new Error('Missing database card')
  return node
}

describe('Database DDL round trip', () => {

  it.each(fixtures)('%s keeps every table Definition and Extra DDL', async (name) => {
    const sql = fixture(name)
    const imported = await importDatabaseSql(sql, { wasm })
    const exported = exportDatabaseDdl(imported.canvas)
    const reimported = await importDatabaseSql(exported, { wasm })

    expect(definitions(reimported.canvas)).toEqual(definitions(imported.canvas))
    expect(stringField(databaseNode(reimported.canvas), 'extra'))
      .toEqual(stringField(databaseNode(imported.canvas), 'extra'))
  })
})
