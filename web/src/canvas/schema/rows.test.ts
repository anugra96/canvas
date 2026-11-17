import { describe, expect, it } from 'vitest'

import { buildSchemaColumns, parseFieldModel } from '@canvas/contract'

import { validateSchemaRow } from './jsonSchema'
import { dateTimeInputValue, rfc3339FromLocalDateTime, setAt } from './rowValues'

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
    { name: 'valid row', row: { id: 'x', kind: 'open', email: 'a@example.com', tags: [1], thing: { id: 't' } }, cells: [], messages: [] },
    { name: 'required missing', row: {}, cells: ['id'], messages: ['id: required'] },
    { name: 'type mismatch', row: { id: 1 }, cells: ['id'], messages: ['id: must be a string'] },
    { name: 'enum mismatch', row: { id: 'x', kind: 'pending' }, cells: ['kind'], messages: ['kind: must be one of open, closed'] },
    { name: 'format mismatch', row: { id: 'x', email: 'not-an-email' }, cells: ['email'], messages: ['email: must be an email address'] },
    { name: 'nested required', row: { id: 'x', owner: {} }, cells: ['owner.name'], messages: ['owner.name: required'] },
    { name: 'array item type', row: { id: 'x', tags: ['bad'] }, cells: ['tags'], messages: ['tags: must be an integer'] },
    { name: 'shared ref required', row: { id: 'x', thing: {} }, cells: ['thing'], messages: ['thing: required'] },
  ])('$name', ({ row, cells, messages }) => {
    const result = validateSchemaRow(source, schemas, row, columns)
    expect(Object.keys(result.cells).sort()).toEqual([...cells].sort())
    expect(result.messages).toEqual(messages)
    expect(result.valid).toBe(cells.length === 0)
  })

  it('describes a nullable integer and pattern failure in plain words', () => {
    const nullableSource = JSON.stringify({
      type: 'object',
      properties: {
        count: { type: ['integer', 'null'] },
        zip: { type: 'string', pattern: '^[0-9]{5}$' },
      },
    })
    const nullableColumns = buildSchemaColumns(parseFieldModel(nullableSource))
    const result = validateSchemaRow(nullableSource, [], { count: 'many', zip: 'abc' }, nullableColumns)
    expect(result.messages).toEqual([
      'count: must be an integer or null',
      'zip: must match ^[0-9]{5}$',
    ])
  })

  it('omits nested objects whose dotted columns are all empty', () => {
    expect(setAt({}, ['address', 'zip'], '12345')).toEqual({ address: { zip: '12345' } })
    expect(setAt({ address: { zip: '12345' } }, ['address', 'zip'], undefined)).toEqual({})
    expect(setAt({ address: { zip: '12345', city: 'Oslo' } }, ['address', 'zip'], undefined)).toEqual({
      address: { city: 'Oslo' },
    })
  })

  it('writes RFC 3339 date-times and shows them back in the input', () => {
    const originalTimezone = process.env.TZ
    process.env.TZ = 'UTC'
    try {
      const rfc3339 = rfc3339FromLocalDateTime('2026-11-16T10:30')
      expect(rfc3339).toBe('2026-11-16T10:30:00Z')
      expect(dateTimeInputValue(rfc3339)).toBe('2026-11-16T10:30:00')
    } finally {
      if (originalTimezone === undefined) delete process.env.TZ
      else process.env.TZ = originalTimezone
    }
    expect(rfc3339FromLocalDateTime('tomorrow')).toBe('tomorrow')
  })
})
