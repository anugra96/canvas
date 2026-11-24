import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import { describe, expect, it } from 'vitest'

import type { CanvasDocument, CanvasNode, JsonCanvas } from '../jsonCanvas'
import { withCanvasDatabaseTarget } from '../databaseTarget'
import { migrateCanvasDocument } from '../migrations'
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

function storedDatabaseCanvas(canvas: JsonCanvas): JsonCanvas {
  const withoutTarget = withCanvasDatabaseTarget(canvas, undefined)
  return {
    ...withoutTarget,
    app: withoutTarget.app
      ? { ...withoutTarget.app, profileVersion: 1 }
      : withoutTarget.app,
  }
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

  it.each(fixtures)('%s exports the same DDL after migrating a stored v3 canvas', async (name) => {
    const imported = await importDatabaseSql(fixture(name), { wasm })
    const document: CanvasDocument = {
      id: 'canvas-1',
      title: 'Stored database',
      etag: 'etag-1',
      updatedAt: '2026-01-01T00:00:00.000Z',
      updatedBy: 'Tester',
      nodeCount: imported.canvas.nodes?.length ?? 0,
      edgeCount: 0,
      profile: 'database',
      schemaVersion: 3,
      canvas: storedDatabaseCanvas(imported.canvas),
    }

    const migrated = migrateCanvasDocument(document)
    expect(migrated.canvas.app).toMatchObject({ target: 'postgres', profileVersion: 2 })

    const expected = readFileSync(
      new URL(`./fixtures/expected/${name}.ddl`, import.meta.url),
      'utf8',
    )
    expect(exportDatabaseDdl(migrated.canvas)).toBe(expected)
  })
})
