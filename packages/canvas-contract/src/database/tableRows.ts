import type { CanvasNode } from '../jsonCanvas'
import { getEntityMeta } from '../ontology'
import {
  classifyColumnType,
  type ColumnTypeClassification,
  type NeutralColumnType,
} from './columnTypes'
import type { TableDefinition } from './model'

export const TABLE_SAMPLE_ROW_LIMIT = 20
export const TABLE_TEST_ROW_LIMIT = 1000

export type TableRow = Record<string, string | null>

export interface TableSamplesParseResult {
  rows: TableRow[]
  error?: string
}

export interface TableRowValidationContext {
  enumValues: Map<string, string[]>
  parentRows: (schema: string, table: string) => TableRow[] | undefined
}

export interface TableRowValidation {
  rows: Array<{ valid: boolean; cells: Record<string, string> }>
  validCount: number
  uncheckedColumns: string[]
  checksNotEvaluated: boolean
}

function sampleRow(value: unknown): TableRow | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const row: TableRow = {}
  for (const [key, item] of Object.entries(value)) {
    if (item === null) row[key] = null
    else if (item !== undefined) row[key] = String(item)
  }
  return row
}

export function parseTableSamplesValue(source: unknown): TableSamplesParseResult {
  if (source == null) return { rows: [] }
  if (typeof source === 'string' && source.trim() === '') return { rows: [] }
  let parsed: unknown = source
  if (typeof source === 'string') {
    try {
      parsed = JSON.parse(source)
    } catch {
      return { rows: [], error: 'Sample rows are not valid JSON.' }
    }
  }
  if (!Array.isArray(parsed)) {
    return { rows: [], error: 'Sample rows must be a JSON array of objects.' }
  }
  const rows: TableRow[] = []
  for (const item of parsed) {
    const row = sampleRow(item)
    if (!row) return { rows: [], error: 'Each sample row must be an object.' }
    rows.push(row)
  }
  return { rows: rows.slice(0, TABLE_SAMPLE_ROW_LIMIT) }
}

export function parseTableSamples(node: CanvasNode): TableSamplesParseResult {
  return parseTableSamplesValue(getEntityMeta(node)?.fields.samples)
}

export function stringifyTableSamples(rows: TableRow[]): string {
  return JSON.stringify(rows, null, 2)
}

export function renameTableSampleColumn(
  rows: TableRow[],
  oldName: string,
  newName: string,
): TableRow[] {
  if (!newName || oldName === newName) return rows
  return rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => (
    key === oldName ? [newName, value] : [key, value]
  ))))
}

function renameReferences(definition: TableDefinition, oldName: string, newName: string): TableDefinition {
  const rename = (columns: string[]) => columns.map((name) => name === oldName ? newName : name)
  return {
    ...definition,
    ...(definition.primaryKey
      ? { primaryKey: { ...definition.primaryKey, columns: rename(definition.primaryKey.columns) } }
      : {}),
    uniques: definition.uniques.map((unique) => ({ ...unique, columns: rename(unique.columns) })),
    foreignKeys: definition.foreignKeys.map((foreignKey) => ({
      ...foreignKey,
      columns: rename(foreignKey.columns),
    })),
    indexes: definition.indexes.map((index) => ({ ...index, columns: rename(index.columns) })),
  }
}

/**
 * Renames the column at `index` in `base`, moving its keys, indexes, and sample values with it.
 * Pass the table as it was before the rename began (e.g. when the name field got focus), so a
 * name typed on the way (e.g. "id" while typing "id_email") never captures another column's keys.
 * While the new name equals another column's name, keys and samples stay where they were.
 */
export function renameTableColumn(
  base: { definition: TableDefinition; samples: TableRow[] },
  index: number,
  newName: string,
): { definition: TableDefinition; samples: TableRow[] } {
  const current = base.definition.columns[index]
  if (!current) return base
  const oldName = current.name
  const definition = {
    ...base.definition,
    columns: base.definition.columns.map((column, position) => (
      position === index ? { ...column, name: newName } : column
    )),
  }
  const usedByOther = (name: string) => base.definition.columns.some((column, position) => (
    position !== index && column.name === name
  ))
  if (!newName || newName === oldName || usedByOther(oldName) || usedByOther(newName)) {
    return { definition, samples: base.samples }
  }
  return {
    definition: renameReferences(definition, oldName, newName),
    samples: renameTableSampleColumn(base.samples, oldName, newName),
  }
}

export function removeTableSampleColumn(rows: TableRow[], columnName: string): TableRow[] {
  return rows.map((row) => Object.fromEntries(
    Object.entries(row).filter(([key]) => key !== columnName),
  ))
}

function valueAt(row: TableRow, columnName: string): string | null {
  const value = row[columnName]
  return value === undefined ? null : value
}

function empty(value: string | null): boolean {
  return value === null || value.trim() === ''
}

function validCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day <= (days[month - 1] ?? 0)
}

function integerInRange(value: string, minimum: bigint, maximum: bigint): boolean {
  const text = value.trim()
  if (!/^[+-]?\d+$/.test(text)) return false
  const number = BigInt(text)
  return number >= minimum && number <= maximum
}

function decimalMessage(value: string, type: NeutralColumnType): string | undefined {
  const match = /^[+-]?(?:(\d+)(?:\.(\d*))?|\.(\d+))$/.exec(value.trim())
  if (!match) return 'Not a decimal'
  const integerDigits = (match[1] ?? '').replace(/^0+/, '').length
  const fractionDigits = (match[2] ?? match[3] ?? '').length
  const scale = type.scale ?? (type.precision !== undefined ? 0 : undefined)
  if (scale !== undefined && fractionDigits > scale) return `More than ${scale} decimals`
  if (type.precision !== undefined && scale !== undefined) {
    const maximumIntegerDigits = type.precision - scale
    if (integerDigits > maximumIntegerDigits) return `More than ${maximumIntegerDigits} digits`
  }
  return undefined
}

function timestampMessage(value: string): string | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(?:[Zz]|[+-](\d{2}):?(\d{2}))?$/
    .exec(value.trim())
  if (!match) return 'Not a timestamp'
  const [, year, month, day, hour, minute, second = '0', , offsetHour, offsetMinute] = match
  if (!validCalendarDate(Number(year), Number(month), Number(day))) return 'Not a timestamp'
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return 'Not a timestamp'
  if (offsetHour !== undefined && (Number(offsetHour) > 23 || Number(offsetMinute) > 59)) {
    return 'Not a timestamp'
  }
  return undefined
}

function binaryValid(value: string): boolean {
  if (/^0x(?:[0-9a-f]{2})+$/i.test(value)) return true
  if (!value) return false
  return /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
}

function neutralMessage(value: string, type: NeutralColumnType): string | undefined {
  switch (type.type) {
    case 'text':
      return undefined
    case 'varchar':
      return type.length !== undefined && value.length > type.length
        ? `Longer than ${type.length}`
        : undefined
    case 'integer':
      return integerInRange(value, -2147483648n, 2147483647n) ? undefined : 'Not an integer'
    case 'bigint':
      return integerInRange(value, -9223372036854775808n, 9223372036854775807n)
        ? undefined
        : 'Not a bigint'
    case 'decimal':
      return decimalMessage(value, type)
    case 'boolean':
      return /^(?:true|false|t|f|1|0)$/i.test(value.trim()) ? undefined : 'Not a boolean'
    case 'uuid':
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim())
        ? undefined
        : 'Not a uuid'
    case 'date': {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
      return match && validCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]))
        ? undefined
        : 'Not a date'
    }
    case 'timestamp':
      return timestampMessage(value)
    case 'json':
      try {
        JSON.parse(value)
        return undefined
      } catch {
        return 'Not JSON'
      }
    case 'binary':
      return binaryValid(value.trim()) ? undefined : 'Not binary'
  }
}

function classificationMessage(
  value: string,
  classification: ColumnTypeClassification,
  context: TableRowValidationContext,
): string | undefined {
  if (classification.kind === 'native') return undefined
  if (classification.kind === 'neutral') return neutralMessage(value, classification)
  const values = context.enumValues.get(classification.name)
  return values?.includes(value) ? undefined : `Not in ${classification.name}`
}

function foreignKeyMessage(
  row: TableRow,
  foreignKey: TableDefinition['foreignKeys'][number],
  context: TableRowValidationContext,
): string | undefined {
  const parent = context.parentRows(foreignKey.references.schema, foreignKey.references.table)
  if (!parent || parent.length === 0) return undefined
  const childValues = foreignKey.columns.map((name) => valueAt(row, name))
  if (childValues.some(empty)) return undefined
  const found = parent.some((parentRow) => foreignKey.references.columns.every((name, index) => {
    const parentValue = valueAt(parentRow, name)
    return parentValue !== null && parentValue === childValues[index]
  }))
  if (found) return undefined
  const columns = foreignKey.references.columns.join(', ')
  const values = childValues.map((value) => String(value)).join(', ')
  return `No ${foreignKey.references.schema}.${foreignKey.references.table} row with ${columns} = ${values}`
}

export function validateTableRows(
  definition: TableDefinition,
  rows: TableRow[],
  context: TableRowValidationContext,
): TableRowValidation {
  const classifications = new Map<string, ColumnTypeClassification>()
  const uncheckedColumns: string[] = []
  for (const column of definition.columns) {
    const classification = classifyColumnType(column.type, context.enumValues.keys())
    classifications.set(column.name, classification)
    if (classification.kind === 'native') uncheckedColumns.push(column.name)
  }

  const keyConstraints = [
    ...(definition.primaryKey ? [definition.primaryKey.columns] : []),
    ...definition.uniques.map((unique) => unique.columns),
  ]
  const seenKeys = keyConstraints.map(() => new Map<string, number>())
  const result: TableRowValidation['rows'] = rows.map(() => ({ valid: true, cells: {} }))

  rows.forEach((row, rowIndex) => {
    const cells = result[rowIndex]!.cells
    for (const column of definition.columns) {
      const value = valueAt(row, column.name)
      if (column.generated) {
        if (!empty(value)) cells[column.name] = 'Generated: leave empty'
        continue
      }
      if (empty(value)) {
        if (!column.nullable && !column.default && !column.identity) {
          cells[column.name] = 'Required'
        }
        continue
      }
      const message = classificationMessage(value ?? '', classifications.get(column.name)!, context)
      if (message) cells[column.name] = message
    }

    keyConstraints.forEach((columns, constraintIndex) => {
      const values = columns.map((name) => valueAt(row, name))
      if (values.some(empty)) return
      const tuple = values.map((value) => String(value)).join('\u0000')
      const seen = seenKeys[constraintIndex]!
      const previous = seen.get(tuple)
      if (previous === undefined) {
        seen.set(tuple, rowIndex)
        return
      }
      for (const name of columns) {
        cells[name] = 'Duplicate key'
        result[previous]!.cells[name] = 'Duplicate key'
      }
    })

    for (const foreignKey of definition.foreignKeys) {
      const message = foreignKeyMessage(row, foreignKey, context)
      if (!message) continue
      for (const name of foreignKey.columns) cells[name] = message
    }
  })

  const rowsResult = result.map((row) => ({
    ...row,
    valid: Object.keys(row.cells).length === 0,
  }))
  return {
    rows: rowsResult,
    validCount: rowsResult.filter((row) => row.valid).length,
    uncheckedColumns,
    checksNotEvaluated: definition.checks.length > 0
      || definition.columns.some((column) => Boolean(column.generated)),
  }
}

function newUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16)
    const value = character === 'x' ? random : (random & 0x3) | 0x8
    return value.toString(16)
  })
}

function nextIntegerKey(rows: TableRow[], columnName: string): string {
  const used = new Set<bigint>()
  for (const row of rows) {
    const value = valueAt(row, columnName)
    if (value !== null && /^[+-]?\d+$/.test(value.trim())) used.add(BigInt(value.trim()))
  }
  let candidate = 1n
  while (used.has(candidate)) candidate += 1n
  return candidate.toString()
}

function nextTextKey(rows: TableRow[], columnName: string, length: number | undefined): string {
  const used = new Set(rows.map((row) => valueAt(row, columnName)))
  for (let counter = 1; ; counter += 1) {
    const suffix = String(counter)
    const prefix = 'sample'.slice(0, Math.max(0, (length ?? Infinity) - suffix.length))
    const candidate = `${prefix}${suffix}`
    if (!used.has(candidate)) return candidate
  }
}

function sampleValue(type: NeutralColumnType): string {
  switch (type.type) {
    case 'text':
      return 'sample'
    case 'varchar':
      return type.length === undefined ? 'sample' : 'sample'.slice(0, type.length)
    case 'integer':
    case 'bigint':
      return '1'
    case 'decimal':
      return '1'
    case 'boolean':
      return 'true'
    case 'uuid':
      return newUuid()
    case 'date':
      return '2026-01-01'
    case 'timestamp':
      return '2026-01-01T00:00:00Z'
    case 'json':
      return '{}'
    case 'binary':
      return '0x00'
  }
}

function keyColumns(definition: TableDefinition): Set<string> {
  return new Set([
    ...(definition.primaryKey?.columns ?? []),
    ...definition.uniques.flatMap((unique) => unique.columns),
  ])
}

function foreignKeyForColumn(
  definition: TableDefinition,
  columnName: string,
): { foreignKey: TableDefinition['foreignKeys'][number]; index: number } | undefined {
  for (const foreignKey of definition.foreignKeys) {
    const index = foreignKey.columns.indexOf(columnName)
    if (index >= 0) return { foreignKey, index }
  }
  return undefined
}

export function generateTableRow(
  definition: TableDefinition,
  context: TableRowValidationContext,
  existingRows: TableRow[],
): TableRow {
  const keys = keyColumns(definition)
  const row: TableRow = {}
  for (const column of definition.columns) {
    if (column.generated || column.default !== undefined || column.identity !== undefined) {
      row[column.name] = null
      continue
    }
    const foreign = foreignKeyForColumn(definition, column.name)
    if (foreign) {
      const parent = context.parentRows(
        foreign.foreignKey.references.schema,
        foreign.foreignKey.references.table,
      )
      const parentRow = parent?.[0]
      const parentColumn = foreign.foreignKey.references.columns[foreign.index]
      const parentValue = parentRow && parentColumn ? valueAt(parentRow, parentColumn) : null
      if (parentValue !== null) {
        row[column.name] = parentValue
        continue
      }
    }
    const classification = classifyColumnType(column.type, context.enumValues.keys())
    if (keys.has(column.name) && classification.kind === 'neutral') {
      if (classification.type === 'integer' || classification.type === 'bigint') {
        row[column.name] = nextIntegerKey(existingRows, column.name)
        continue
      }
      if (classification.type === 'uuid') {
        row[column.name] = newUuid()
        continue
      }
      if (classification.type === 'text' || classification.type === 'varchar') {
        row[column.name] = nextTextKey(existingRows, column.name, classification.length)
        continue
      }
    }
    if (classification.kind === 'enum') {
      row[column.name] = context.enumValues.get(classification.name)?.[0] ?? null
      continue
    }
    if (classification.kind === 'neutral') {
      row[column.name] = sampleValue(classification)
      continue
    }
    row[column.name] = 'sample'
  }
  return row
}
