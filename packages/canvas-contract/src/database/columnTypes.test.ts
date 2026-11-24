import { describe, expect, it } from 'vitest'

import { classifyColumnType, type ColumnTypeClassification } from './columnTypes'
import { databaseTargetAdapter } from './targets/postgres'

describe('classifyColumnType', () => {
  const cases: Array<[string, ColumnTypeClassification]> = [
    ['text', { kind: 'neutral', type: 'text' }],
    ['varchar(255)', { kind: 'neutral', type: 'varchar', length: 255 }],
    ['character varying(120)', { kind: 'neutral', type: 'varchar', length: 120 }],
    ['integer', { kind: 'neutral', type: 'integer' }],
    ['bigint', { kind: 'neutral', type: 'bigint' }],
    ['decimal(10,2)', { kind: 'neutral', type: 'decimal', precision: 10, scale: 2 }],
    ['numeric(6)', { kind: 'neutral', type: 'decimal', precision: 6 }],
    ['boolean', { kind: 'neutral', type: 'boolean' }],
    ['uuid', { kind: 'neutral', type: 'uuid' }],
    ['date', { kind: 'neutral', type: 'date' }],
    ['timestamp', { kind: 'neutral', type: 'timestamp' }],
    ['timestamp with time zone', { kind: 'neutral', type: 'timestamp' }],
    ['json', { kind: 'neutral', type: 'json' }],
    ['binary', { kind: 'neutral', type: 'binary' }],
    ['bytea', { kind: 'neutral', type: 'binary' }],
    ['timestamp without time zone', { kind: 'native', type: 'timestamp without time zone' }],
    ['jsonb', { kind: 'native', type: 'jsonb' }],
    ['inet', { kind: 'native', type: 'inet' }],
  ]

  it.each(cases)('classifies %s', (columnType, expected) => {
    expect(classifyColumnType(columnType)).toEqual(expected)
  })

  it('classifies the canvas enums as enum names', () => {
    expect(classifyColumnType('app.task_status', ['app.task_status', 'app.member_role']))
      .toEqual({ kind: 'enum', name: 'app.task_status' })
    expect(classifyColumnType('task_status', ['app.task_status'])).toEqual({
      kind: 'native',
      type: 'task_status',
    })
  })
})

describe('PostgreSQL target adapter', () => {
  const adapter = databaseTargetAdapter('postgres')
  const cases: Array<[string, string]> = [
    ['timestamp', 'timestamp with time zone'],
    ['binary', 'bytea'],
    ['text', 'text'],
    ['varchar(255)', 'varchar(255)'],
    ['numeric(10,2)', 'numeric(10,2)'],
    ['timestamp with time zone', 'timestamp with time zone'],
    ['timestamp without time zone', 'timestamp without time zone'],
    ['jsonb', 'jsonb'],
    ['bytea', 'bytea'],
  ]

  it.each(cases)('writes %s as %s', (columnType, expected) => {
    expect(adapter?.typeFor(columnType)).toBe(expected)
  })

  it('leaves the type unchanged when no target is chosen', () => {
    expect(databaseTargetAdapter(undefined)).toBeUndefined()
    expect(databaseTargetAdapter('sqlite')).toBeUndefined()
    expect(databaseTargetAdapter('dynamodb')).toBeUndefined()
  })
})
