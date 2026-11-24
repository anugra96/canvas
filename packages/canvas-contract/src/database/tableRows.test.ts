import { describe, expect, it } from 'vitest'

import type { CanvasNode } from '../jsonCanvas'
import type { TableColumn, TableDefinition } from './model'
import {
  generateTableRow,
  parseTableSamples,
  removeTableSampleColumn,
  renameTableColumn,
  renameTableSampleColumn,
  stringifyTableSamples,
  validateTableRows,
  type TableRow,
  type TableRowValidationContext,
} from './tableRows'

function column(
  name: string,
  type: string,
  extra: Partial<TableColumn> = {},
): TableColumn {
  return { name, type, nullable: true, ...extra }
}

function definition(
  columns: TableColumn[],
  extra: Partial<TableDefinition> = {},
): TableDefinition {
  return {
    columns,
    uniques: [],
    checks: [],
    foreignKeys: [],
    indexes: [],
    ...extra,
  }
}

function tableNode(samples: unknown): CanvasNode {
  return {
    id: 'table-1',
    type: 'text',
    x: 0,
    y: 0,
    width: 320,
    height: 180,
    text: '',
    app: {
      entityType: 'table',
      fields: { samples: samples == null ? '' : String(samples) },
    },
  }
}

const baseContext: TableRowValidationContext = {
  enumValues: new Map(),
  parentRows: () => undefined,
}

describe('validateTableRows', () => {
  const cases: Array<{
    name: string
    definition: TableDefinition
    rows: TableRow[]
    context?: Partial<TableRowValidationContext>
    messages: Array<Record<string, string>>
    validCount?: number
    uncheckedColumns?: string[]
    checksNotEvaluated?: boolean
  }> = [
    {
      name: 'requires a NOT NULL column without a default or identity',
      definition: definition([column('id', 'integer', { nullable: false })]),
      rows: [{}],
      messages: [{ id: 'Required' }],
    },
    {
      name: 'accepts an empty NOT NULL column with a default or identity',
      definition: definition([
        column('id', 'integer', { nullable: false, default: '1' }),
        column('seq', 'bigint', { nullable: false, identity: 'by_default' }),
      ]),
      rows: [{}],
      messages: [{}],
    },
    {
      name: 'checks the integer range',
      definition: definition([column('id', 'integer')]),
      rows: [{ id: '-2147483648' }, { id: '2147483648' }],
      messages: [{}, { id: 'Not an integer' }],
    },
    {
      name: 'checks the bigint range with BigInt',
      definition: definition([column('value', 'bigint')]),
      rows: [{ value: '9223372036854775807' }, { value: '9223372036854775808' }],
      messages: [{}, { value: 'Not a bigint' }],
    },
    {
      name: 'checks decimal digits and scale',
      definition: definition([column('amount', 'decimal(5,2)')]),
      rows: [{ amount: '123.45' }, { amount: '1234.56' }, { amount: '1.234' }],
      messages: [{}, { amount: 'More than 3 digits' }, { amount: 'More than 2 decimals' }],
    },
    {
      name: 'checks varchar length',
      definition: definition([column('name', 'varchar(3)')]),
      rows: [{ name: 'abcd' }, { name: 'abc' }],
      messages: [{ name: 'Longer than 3' }, {}],
    },
    {
      name: 'checks enum values',
      definition: definition([column('status', 'status')]),
      rows: [{ status: 'open' }, { status: 'pending' }],
      context: { enumValues: new Map([['status', ['open', 'closed']]]) },
      messages: [{}, { status: 'Not in status' }],
    },
    {
      name: 'checks booleans in any case',
      definition: definition([column('flag', 'boolean')]),
      rows: [{ flag: 'TRUE' }, { flag: 'yes' }],
      messages: [{}, { flag: 'Not a boolean' }],
    },
    {
      name: 'checks uuids',
      definition: definition([column('ref', 'uuid')]),
      rows: [
        { ref: '6f1e6a1e-1234-4abc-8def-1234567890ab' },
        { ref: 'nope' },
      ],
      messages: [{}, { ref: 'Not a uuid' }],
    },
    {
      name: 'checks real calendar dates',
      definition: definition([column('day', 'date')]),
      rows: [{ day: '2026-02-30' }, { day: '2026-02-28' }],
      messages: [{ day: 'Not a date' }, {}],
    },
    {
      name: 'checks timestamps with or without an offset',
      definition: definition([column('at', 'timestamp')]),
      rows: [
        { at: '2026-02-30T00:00:00' },
        { at: '2026-02-28T12:00:00Z' },
        { at: '2026-02-28T12:00:00+02:00' },
      ],
      messages: [{ at: 'Not a timestamp' }, {}, {}],
    },
    {
      name: 'checks JSON',
      definition: definition([column('doc', 'json')]),
      rows: [{ doc: '{}' }, { doc: '{' }],
      messages: [{}, { doc: 'Not JSON' }],
    },
    {
      name: 'checks binary as hex or base64',
      definition: definition([column('blob', 'binary')]),
      rows: [{ blob: '0x00ff' }, { blob: 'aGVsbG8=' }, { blob: 'not base64!' }],
      messages: [{}, {}, { blob: 'Not binary' }],
    },
    {
      name: 'finds duplicate primary keys and composite unique tuples, but NULLs do not collide',
      definition: definition(
        [column('id', 'integer', { nullable: false }), column('a', 'text'), column('b', 'text')],
        {
          primaryKey: { columns: ['id'] },
          uniques: [{ columns: ['a', 'b'] }],
        },
      ),
      rows: [
        { id: '1', a: 'x', b: null },
        { id: '1', a: 'x', b: null },
        { id: '2', a: 'x', b: null },
      ],
      messages: [{ id: 'Duplicate key' }, { id: 'Duplicate key' }, {}],
    },
    {
      name: 'accepts a foreign key found in the parent sample rows',
      definition: definition(
        [column('parent_id', 'integer')],
        {
          foreignKeys: [{
            columns: ['parent_id'],
            references: { schema: 'public', table: 'parent', columns: ['id'] },
          }],
        },
      ),
      rows: [{ parent_id: '7' }],
      context: {
        parentRows: (schema, table) => (
          schema === 'public' && table === 'parent' ? [{ id: '7' }] : undefined
        ),
      },
      messages: [{}],
    },
    {
      name: 'reports a foreign key missing from the parent sample rows',
      definition: definition(
        [column('parent_id', 'integer')],
        {
          foreignKeys: [{
            columns: ['parent_id'],
            references: { schema: 'public', table: 'parent', columns: ['id'] },
          }],
        },
      ),
      rows: [{ parent_id: '8' }],
      context: {
        parentRows: (schema, table) => (
          schema === 'public' && table === 'parent' ? [{ id: '7' }] : undefined
        ),
      },
      messages: [{ parent_id: 'No public.parent row with id = 8' }],
    },
    {
      name: 'skips a foreign key when the parent has no sample rows',
      definition: definition(
        [column('parent_id', 'integer')],
        {
          foreignKeys: [{
            columns: ['parent_id'],
            references: { schema: 'public', table: 'parent', columns: ['id'] },
          }],
        },
      ),
      rows: [{ parent_id: '8' }],
      messages: [{}],
    },
    {
      name: 'lists native columns as unchecked',
      definition: definition([column('addr', 'inet')]),
      rows: [{ addr: '::1' }],
      messages: [{}],
      uncheckedColumns: ['addr'],
    },
    {
      name: 'does not evaluate checks or generated columns, and requires generated cells to stay empty',
      definition: definition(
        [column('value', 'integer'), column('doubled', 'integer', { generated: '(value * 2)' })],
        { checks: [{ expression: 'value > 0' }] },
      ),
      rows: [{ value: '1', doubled: null }, { value: '1', doubled: '2' }],
      messages: [{}, { doubled: 'Generated: leave empty' }],
      checksNotEvaluated: true,
    },
  ]

  it.each(cases)('$name', ({
    definition: table,
    rows,
    context,
    messages,
    validCount,
    uncheckedColumns,
    checksNotEvaluated,
  }) => {
    const result = validateTableRows(table, rows, { ...baseContext, ...context })
    expect(result.rows.map((row) => row.cells)).toEqual(messages)
    expect(result.validCount).toBe(
      validCount ?? messages.filter((cells) => Object.keys(cells).length === 0).length,
    )
    expect(result.uncheckedColumns).toEqual(uncheckedColumns ?? [])
    expect(result.checksNotEvaluated).toBe(checksNotEvaluated ?? false)
  })
})

describe('generateTableRow', () => {
  it('makes a valid row for every neutral type, an enum, an integer key, and a parent key', () => {
    const parentRows = [{ id: '7' }]
    const table = definition(
      [
        column('id', 'integer', { nullable: false }),
        column('parent_id', 'integer'),
        column('label', 'text', { nullable: false }),
        column('code', 'varchar(10)', { nullable: false }),
        column('quantity', 'bigint', { nullable: false }),
        column('amount', 'decimal(6,2)', { nullable: false }),
        column('active', 'boolean', { nullable: false }),
        column('token', 'uuid', { nullable: false }),
        column('day', 'date', { nullable: false }),
        column('at', 'timestamp', { nullable: false }),
        column('doc', 'json', { nullable: false }),
        column('blob', 'binary', { nullable: false }),
        column('status', 'status', { nullable: false }),
        column('kind', 'text', { nullable: false, default: "'item'" }),
        column('seq', 'integer', { nullable: false, identity: 'by_default' }),
        column('doubled', 'integer', { nullable: false, generated: '(id * 2)' }),
      ],
      {
        primaryKey: { columns: ['id'] },
        uniques: [{ columns: ['label'] }, { columns: ['code'] }],
        foreignKeys: [{
          columns: ['parent_id'],
          references: { schema: 'public', table: 'parent', columns: ['id'] },
        }],
      },
    )
    const context: TableRowValidationContext = {
      enumValues: new Map([['status', ['open', 'closed']]]),
      parentRows: (schema, name) => (
        schema === 'public' && name === 'parent' ? parentRows : undefined
      ),
    }

    const first = generateTableRow(table, context, [])
    expect(first).toMatchObject({
      parent_id: '7',
      status: 'open',
      kind: null,
      seq: null,
      doubled: null,
    })
    expect(validateTableRows(table, [first], context).rows[0]?.valid).toBe(true)

    const second = generateTableRow(table, context, [first])
    expect(second.id).not.toBe(first.id)
    expect(validateTableRows(table, [first, second], context).validCount).toBe(2)
  })
})

describe('renameTableColumn', () => {
  // Typing "id_email" over "email" passes through "id", the primary key column's name.
  const base = {
    definition: definition(
      [column('id', 'integer', { nullable: false }), column('email', 'text')],
      { primaryKey: { columns: ['id'] }, uniques: [{ columns: ['email'] }] },
    ),
    samples: [{ id: '1', email: 'a@x.com' }] as TableRow[],
  }
  const cases: Array<[string, string[], string[], TableRow]> = [
    ['i', ['id'], ['i'], { id: '1', i: 'a@x.com' }],
    ['id', ['id'], ['email'], { id: '1', email: 'a@x.com' }],
    ['id_', ['id'], ['id_'], { id: '1', id_: 'a@x.com' }],
    ['id_email', ['id'], ['id_email'], { id: '1', id_email: 'a@x.com' }],
  ]

  it.each(cases)('typing %s keeps the key on its own column', (typed, primaryKey, unique, sample) => {
    const result = renameTableColumn(base, 1, typed)
    expect(result.definition.columns.map((item) => item.name)).toEqual(['id', typed])
    expect(result.definition.primaryKey?.columns).toEqual(primaryKey)
    expect(result.definition.uniques[0]?.columns).toEqual(unique)
    expect(result.samples).toEqual([sample])
  })
})

describe('table samples', () => {
  it('renames and removes the saved sample key with the column', () => {
    const node = tableNode('[{"id":1,"name":"Ada"}]')
    const parsed = parseTableSamples(node)
    expect(parsed.error).toBeUndefined()
    expect(parsed.rows).toEqual([{ id: '1', name: 'Ada' }])

    expect(renameTableSampleColumn(parsed.rows, 'name', 'title')).toEqual([
      { id: '1', title: 'Ada' },
    ])
    expect(removeTableSampleColumn(parsed.rows, 'name')).toEqual([{ id: '1' }])
    expect(stringifyTableSamples([{ id: '1', title: 'Ada' }])).toBe(
      '[\n  {\n    "id": "1",\n    "title": "Ada"\n  }\n]',
    )
  })

  it('returns no rows and an error for broken or non-array samples', () => {
    expect(parseTableSamples(tableNode('{')).rows).toEqual([])
    expect(parseTableSamples(tableNode('{')).error).toBeTruthy()
    expect(parseTableSamples(tableNode('{"id":1}')).rows).toEqual([])
    expect(parseTableSamples(tableNode('{"id":1}')).error).toBeTruthy()
    expect(parseTableSamples(tableNode('')).rows).toEqual([])
  })
})
