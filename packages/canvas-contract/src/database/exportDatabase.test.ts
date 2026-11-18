import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import { describe, expect, it } from 'vitest'

import type { JsonCanvas } from '../jsonCanvas'
import { exportDatabaseDdl } from './exportDatabase'
import { tableDefinitionFromUnknown } from './model'
import { loadDatabaseParser } from './parser'

const require = createRequire(import.meta.url)
const wasm = readFileSync(require.resolve('libpg-query/wasm/libpg-query.wasm'))

describe('Database DDL export', () => {
  it('treats blank optional text as absent and exports DDL the parser accepts', async () => {
    const source = {
      columns: [
        { name: 'id', type: 'uuid', nullable: false, default: '' },
        {
          name: 'email',
          type: 'text',
          nullable: false,
          default: '   ',
          generated: '',
          comment: '  ',
        },
      ],
      uniques: [],
      checks: [{ name: 'blank_check', expression: '   ' }],
      foreignKeys: [],
      indexes: [
        { name: 'email_idx', unique: false, method: 'btree', columns: ['email'], where: '   ' },
      ],
    }

    const definition = tableDefinitionFromUnknown(source)
    expect(definition).toBeTruthy()
    expect(definition!.columns[0]).not.toHaveProperty('default')
    expect(definition!.columns[1]).not.toHaveProperty('default')
    expect(definition!.columns[1]).not.toHaveProperty('generated')
    expect(definition!.columns[1]).not.toHaveProperty('comment')
    expect(definition!.checks).toEqual([])
    expect(definition!.indexes[0]).not.toHaveProperty('where')

    const canvas: JsonCanvas = {
      nodes: [
        {
          id: 'table-account',
          type: 'text',
          x: 0,
          y: 0,
          width: 360,
          height: 240,
          text: '',
          app: {
            entityType: 'table',
            fields: {
              name: 'account',
              schema: 'public',
              definition: JSON.stringify(source),
            },
          },
        },
      ],
      edges: [],
    }

    const ddl = exportDatabaseDdl(canvas)
    expect(ddl).toContain('id uuid NOT NULL')
    expect(ddl).toContain('email text NOT NULL')
    expect(ddl).not.toContain('DEFAULT  ')
    expect(ddl).not.toContain('GENERATED ALWAYS AS ()')
    expect(ddl).not.toContain('COMMENT ON COLUMN')
    expect(ddl).not.toContain('WHERE')

    const parser = await loadDatabaseParser(wasm)
    const parsed = await parser.parse(ddl)
    expect(parsed.stmts?.length ?? 0).toBeGreaterThan(0)
  })
})
