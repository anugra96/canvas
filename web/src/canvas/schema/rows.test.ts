import { describe, expect, it } from 'vitest'

import { buildSchemaColumns, parseFieldModel } from '@canvas/contract'

import { validateSchemaRow } from './jsonSchema'

const source = JSON.stringify({
  type: 'object',
  properties: {
    id: { type: 'string' },
    kind: { type: 'string', enum: ['open', 'closed'] },
    email: { type: 'string', format: 'email' },
    owner: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    },
    tags: { type: 'array', items: { type: 'integer' } },
    thing: { $ref: '#/components/schemas/Thing' },
  },
  required: ['id'],
}, null, 2)
const schemas = [{
  name: 'Thing',
  source: JSON.stringify({ type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }),
}]
const columns = buildSchemaColumns(parseFieldModel(source))

describe('schema row validation', () => {
  it.each([
    { name: 'valid row', row: { id: 'x', kind: 'open', email: 'a@example.com', tags: [1], thing: { id: 't' } }, cells: [] },
    { name: 'required missing', row: {}, cells: ['id'] },
    { name: 'type mismatch', row: { id: 1 }, cells: ['id'] },
    { name: 'enum mismatch', row: { id: 'x', kind: 'pending' }, cells: ['kind'] },
    { name: 'format mismatch', row: { id: 'x', email: 'not-an-email' }, cells: ['email'] },
    { name: 'nested required', row: { id: 'x', owner: {} }, cells: ['owner.name'] },
    { name: 'array item type', row: { id: 'x', tags: ['bad'] }, cells: ['tags'] },
    { name: 'shared ref required', row: { id: 'x', thing: {} }, cells: ['thing'] },
  ])('$name', ({ row, cells }) => {
    const result = validateSchemaRow(source, schemas, row, columns)
    expect(Object.keys(result.cells).sort()).toEqual([...cells].sort())
    expect(result.valid).toBe(cells.length === 0)
  })
})
