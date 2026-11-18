import { describe, expect, it } from 'vitest'

import { emptyTableDefinition, tableDefinitionError } from './model'

describe('Table Definition guard', () => {
  it('rejects the foreign key with an empty target table that the editor used to store', () => {
    const invalid = {
      columns: [{ name: 'id', type: 'uuid', nullable: false }],
      uniques: [],
      checks: [],
      foreignKeys: [
        {
          columns: ['id'],
          references: { schema: 'public', table: '', columns: ['id'] },
        },
      ],
      indexes: [],
    }
    expect(tableDefinitionError(invalid)).toContain('references.table')
  })

  it('accepts a valid Definition', () => {
    expect(tableDefinitionError(emptyTableDefinition())).toBeUndefined()
  })
})
