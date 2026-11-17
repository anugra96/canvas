import { describe, expect, it } from 'vitest'

import { applyFieldEdit, applyFieldEditResult, buildSchemaColumns, parseFieldModel, type FieldEdit } from './fieldModel'

const source = JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  'x-root': 'keep',
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid', minLength: 3, pattern: '^[a-z]+$', default: 'abc', description: 'ID', 'x-property': 'keep' },
    owner: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: ['integer', 'null'], minimum: 0, maximum: 10, default: 5 },
      },
      required: ['name'],
    },
    state: { type: 'string', enum: ['open', 'closed'] },
    choice: { oneOf: [{ type: 'string' }, { type: 'number' }] },
  },
  required: ['id', 'owner'],
}, null, 2)

interface TestSchema extends Record<string, unknown> {
  properties: Record<string, TestSchema>
  required?: string[]
  type?: unknown
  enum?: unknown
  $ref?: unknown
}

function edited(edit: FieldEdit): TestSchema {
  return JSON.parse(applyFieldEdit(source, edit)) as TestSchema
}

describe('schema field model', () => {
  it('parses nested rows, nullable, enums, and advanced rows', () => {
    const model = parseFieldModel(source)
    expect(model.valid).toBe(true)
    expect(model.rows.map((row) => row.name)).toEqual(['id', 'owner', 'state', 'choice'])
    expect(model.rows[1]?.children.map((row) => [row.name, row.required, row.nullable])).toEqual([
      ['name', true, false],
      ['age', false, true],
    ])
    expect(model.rows[2]?.kind).toBe('enum')
    expect(model.rows[2]?.enumValues).toEqual(['open', 'closed'])
    expect(model.rows[3]?.kind).toBe('advanced')
    expect(buildSchemaColumns(model).map((column) => [column.key, column.required])).toEqual([
      ['id', true],
      ['owner.name', true],
      ['owner.age', false],
      ['state', false],
      ['choice', false],
    ])
  })

  it.each([
    {
      name: 'adds and keeps root keywords',
      edit: { type: 'add', parentPath: [] } as FieldEdit,
      check: (next: TestSchema) => {
        expect(next['x-root']).toBe('keep')
        expect(Object.keys(next.properties).at(-1)).toBe('field')
        expect(next.properties.field).toEqual({ type: 'string' })
      },
    },
    {
      name: 'renames a property and its required entry',
      edit: { type: 'rename', path: ['id'], name: 'identifier' } as FieldEdit,
      check: (next: TestSchema) => {
        expect(Object.keys(next.properties)).toEqual(['identifier', 'owner', 'state', 'choice'])
        expect(next.required).toEqual(['identifier', 'owner'])
        expect(next.properties.identifier!['x-property']).toBe('keep')
      },
    },
    {
      name: 'deletes a property and required entry',
      edit: { type: 'delete', path: ['owner'] } as FieldEdit,
      check: (next: TestSchema) => {
        expect(next.properties.owner!).toBeUndefined()
        expect(next.required).toEqual(['id'])
      },
    },
    {
      name: 'moves a nested property',
      edit: { type: 'move', path: ['owner', 'age'], direction: -1 } as FieldEdit,
      check: (next: TestSchema) => {
        expect(Object.keys(next.properties.owner!.properties)).toEqual(['age', 'name'])
      },
    },
    {
      name: 'sets nullable without losing unknown keywords',
      edit: { type: 'setNullable', path: ['id'], nullable: true } as FieldEdit,
      check: (next: TestSchema) => {
        expect(next.properties.id!.type).toEqual(['string', 'null'])
        expect(next.properties.id!['x-property']).toBe('keep')
      },
    },
    {
      name: 'changes required and keeps key order',
      edit: { type: 'setRequired', path: ['owner'], required: false } as FieldEdit,
      check: (next: TestSchema) => {
        expect(next.required).toEqual(['id'])
        expect(Object.keys(next.properties)).toEqual(['id', 'owner', 'state', 'choice'])
      },
    },
    {
      name: 'updates details',
      edit: {
        type: 'setDetails',
        path: ['id'],
        details: { format: 'uuid', minLength: 3, pattern: '^[a-z]+$' },
      } as FieldEdit,
      check: (next: TestSchema) => {
        expect(next.properties.id!).toMatchObject({ format: 'uuid', minLength: 3, pattern: '^[a-z]+$' })
        expect(next.properties.id!['x-property']).toBe('keep')
      },
    },
    {
      name: 'updates enum values',
      edit: { type: 'setEnum', path: ['state'], values: ['open', 'pending', 'closed'] } as FieldEdit,
      check: (next: TestSchema) => {
        expect(next.properties.state!.enum).toEqual(['open', 'pending', 'closed'])
      },
    },
    {
      name: 'changes a field type',
      edit: { type: 'setType', path: ['state'], kind: 'string' } as FieldEdit,
      check: (next: TestSchema) => {
        expect(next.properties.state!.type).toBe('string')
        expect(next.properties.state!.enum).toBeUndefined()
      },
    },
    {
      name: 'writes a shared schema reference',
      edit: { type: 'setRef', path: ['id'], name: 'Thing' } as FieldEdit,
      check: (next: TestSchema) => {
        expect(next.properties.id!.$ref).toBe('#/components/schemas/Thing')
        expect(next.properties.id!.type).toBeUndefined()
        expect(next.properties.id!['x-property']).toBe('keep')
      },
    },
    {
      name: 'adds a nested field',
      edit: { type: 'add', parentPath: ['owner'], name: 'nickname' } as FieldEdit,
      check: (next: TestSchema) => {
        expect(Object.keys(next.properties.owner!.properties)).toEqual(['name', 'age', 'nickname'])
      },
    },
    {
      name: 'drops string keywords when changing to number',
      edit: { type: 'setType', path: ['id'], kind: 'number' } as FieldEdit,
      check: (next: TestSchema) => {
        expect(next.properties.id!.type).toBe('number')
        expect(next.properties.id!.format).toBeUndefined()
        expect(next.properties.id!.minLength).toBeUndefined()
        expect(next.properties.id!.pattern).toBeUndefined()
        expect(next.properties.id!.default).toBeUndefined()
        expect(next.properties.id!['x-property']).toBe('keep')
      },
    },
    {
      name: 'drops number keywords and mismatched defaults when changing to string',
      edit: { type: 'setType', path: ['owner', 'age'], kind: 'string' } as FieldEdit,
      check: (next: TestSchema) => {
        expect(next.properties.owner!.properties.age!.type).toEqual(['string', 'null'])
        expect(next.properties.owner!.properties.age!.minimum).toBeUndefined()
        expect(next.properties.owner!.properties.age!.maximum).toBeUndefined()
        expect(next.properties.owner!.properties.age!.default).toBeUndefined()
      },
    },
    {
      name: 'leaves advanced rows untouched',
      edit: { type: 'setDescription', path: ['id'], description: 'Identifier' } as FieldEdit,
      check: (next: TestSchema) => {
        expect(next.properties.choice).toEqual(sourceObject().properties.choice)
      },
    },
  ])('$name', ({ edit, check }) => {
    check(edited(edit))
  })

  it('renames and deletes example properties, including nested paths', () => {
    const renamed = JSON.parse(applyFieldEdit(exampleSource, {
      type: 'rename',
      path: ['id'],
      name: 'identifier',
    })) as ExampleSchema
    expect(renamed.examples).toEqual([
      { identifier: 'a', owner: { name: 'Ada' }, extra: true },
      { identifier: 'b', owner: { name: 'Grace' } },
    ])

    const renamedNested = JSON.parse(applyFieldEdit(exampleSource, {
      type: 'rename',
      path: ['owner', 'name'],
      name: 'fullName',
    })) as ExampleSchema
    expect(renamedNested.examples).toEqual([
      { id: 'a', owner: { fullName: 'Ada' }, extra: true },
      { id: 'b', owner: { fullName: 'Grace' } },
    ])

    const deleted = JSON.parse(applyFieldEdit(exampleSource, {
      type: 'delete',
      path: ['owner', 'name'],
    })) as ExampleSchema
    expect(deleted.examples).toEqual([
      { id: 'a', owner: {}, extra: true },
      { id: 'b', owner: {} },
    ])
  })

  it('returns an error when renaming to an existing field name', () => {
    const result = applyFieldEditResult(exampleSource, { type: 'rename', path: ['id'], name: 'owner' })
    expect(result.error).toContain('already exists')
    expect(result.source).toBe(exampleSource)
  })

  it('drops items when leaving array and keeps unknown keywords', () => {
    const arraySource = JSON.stringify({
      type: 'object',
      properties: {
        tags: { type: 'array', items: { type: 'integer' }, 'x-array': 'keep' },
      },
    }, null, 2)
    const next = JSON.parse(applyFieldEdit(arraySource, {
      type: 'setType',
      path: ['tags'],
      kind: 'string',
    })) as TestSchema
    expect(next.properties.tags!.items).toBeUndefined()
    expect(next.properties.tags!.type).toBe('string')
    expect(next.properties.tags!['x-array']).toBe('keep')
  })
})

interface ExampleSchema extends TestSchema {
  examples?: Array<Record<string, unknown>>
}

const exampleSource = JSON.stringify({
  type: 'object',
  properties: {
    id: { type: 'string' },
    owner: { type: 'object', properties: { name: { type: 'string' } } },
  },
  examples: [
    { id: 'a', owner: { name: 'Ada' }, extra: true },
    { id: 'b', owner: { name: 'Grace' } },
  ],
}, null, 2)

function sourceObject(): TestSchema {
  return JSON.parse(source) as TestSchema
}
