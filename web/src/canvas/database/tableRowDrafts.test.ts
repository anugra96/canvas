import { describe, expect, it } from 'vitest'

import {
  validateTableRows,
  type TableColumn,
  type TableDefinition,
  type TableRow,
} from '@canvas/contract'

import { savedTableRows, tableRowsSummary } from './tableRowDrafts'

const columns: TableColumn[] = [
  { name: 'id', type: 'integer', nullable: false },
  { name: 'name', type: 'text', nullable: true },
]
const definition: TableDefinition = {
  columns,
  primaryKey: { columns: ['id'] },
  uniques: [],
  checks: [],
  foreignKeys: [],
  indexes: [],
}
const context = { enumValues: new Map<string, string[]>(), parentRows: () => undefined }

describe('database draft rows', () => {
  it('does not count or save an all-empty row', () => {
    const rows: TableRow[] = [{ id: '1', name: 'Ada' }, {}, { id: null, name: ' ' }]
    const validation = validateTableRows(definition, rows, context)
    const summary = tableRowsSummary(rows, columns, validation)

    expect(summary.drafts).toEqual([false, true, true])
    expect(summary.validCount).toBe(1)
    expect(summary.countedRows).toBe(1)
    expect(savedTableRows(rows, columns)).toEqual([{ id: '1', name: 'Ada' }])
  })
})
