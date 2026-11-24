export const NEUTRAL_TYPES = [
  'text',
  'varchar(n)',
  'integer',
  'bigint',
  'decimal(p,s)',
  'boolean',
  'uuid',
  'date',
  'timestamp',
  'json',
  'binary',
] as const

export type NeutralType =
  | 'text'
  | 'varchar'
  | 'integer'
  | 'bigint'
  | 'decimal'
  | 'boolean'
  | 'uuid'
  | 'date'
  | 'timestamp'
  | 'json'
  | 'binary'

export interface NeutralColumnType {
  kind: 'neutral'
  type: NeutralType
  length?: number
  precision?: number
  scale?: number
}

export interface EnumColumnType {
  kind: 'enum'
  name: string
}

export interface NativeColumnType {
  kind: 'native'
  type: string
}

export type ColumnTypeClassification = NeutralColumnType | EnumColumnType | NativeColumnType

function neutral(
  type: NeutralType,
  params: { length?: number; precision?: number; scale?: number } = {},
): NeutralColumnType {
  return {
    kind: 'neutral',
    type,
    ...(params.length !== undefined ? { length: params.length } : {}),
    ...(params.precision !== undefined ? { precision: params.precision } : {}),
    ...(params.scale !== undefined ? { scale: params.scale } : {}),
  }
}

function numberValue(value: string | undefined): number | undefined {
  return value === undefined ? undefined : Number(value)
}

export function classifyColumnType(
  columnType: string,
  enumNames: Iterable<string> = [],
): ColumnTypeClassification {
  const value = columnType.trim().replace(/\s+/g, ' ')
  const normalized = value.toLowerCase()

  if (normalized === 'text') return neutral('text')
  if (normalized === 'integer') return neutral('integer')
  if (normalized === 'bigint') return neutral('bigint')
  if (normalized === 'boolean') return neutral('boolean')
  if (normalized === 'uuid') return neutral('uuid')
  if (normalized === 'date') return neutral('date')
  if (normalized === 'json') return neutral('json')
  if (normalized === 'binary' || normalized === 'bytea') return neutral('binary')

  const varchar = /^(?:varchar|character varying)(?:\s*\(\s*(\d+)\s*\))?$/.exec(normalized)
  if (varchar) return neutral('varchar', { length: numberValue(varchar[1]) })

  const decimal = /^(?:decimal|numeric)(?:\s*\(\s*(\d+)\s*(?:,\s*(\d+)\s*)?\))?$/.exec(normalized)
  if (decimal) {
    return neutral('decimal', {
      precision: numberValue(decimal[1]),
      scale: numberValue(decimal[2]),
    })
  }

  // Only `timestamp` and `timestamp with time zone` are neutral; a bare Postgres
  // `timestamp` means "without time zone", so imported canvases migrate it.
  const timestamp = /^timestamp(?:\s*\(\s*\d+\s*\))?(?:\s+with time zone)?$/.exec(normalized)
  if (timestamp) return neutral('timestamp')

  for (const name of enumNames) {
    if (name.trim() === value) return { kind: 'enum', name: name.trim() }
  }

  return { kind: 'native', type: value }
}
