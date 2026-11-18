import { z } from 'zod'

import type { CanvasNode } from '../jsonCanvas'
import { getEntityMeta } from '../ontology'

export const TABLE_DEFINITION_VERSION = 1

const optionalText = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().optional(),
)

const requiredText = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().min(1),
)

export const foreignKeyActionSchema = z.enum([
  'no_action',
  'restrict',
  'cascade',
  'set_null',
  'set_default',
])

export const tableColumnSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  nullable: z.boolean(),
  default: optionalText,
  identity: z.enum(['always', 'by_default']).optional(),
  generated: optionalText,
  comment: optionalText,
})

export const tablePrimaryKeySchema = z.object({
  name: optionalText,
  columns: z.array(z.string().min(1)).min(1),
})

export const tableUniqueSchema = z.object({
  name: optionalText,
  columns: z.array(z.string().min(1)).min(1),
})

export const tableCheckSchema = z.object({
  name: optionalText,
  expression: requiredText,
})

export const tableForeignKeySchema = z.object({
  name: optionalText,
  columns: z.array(z.string().min(1)).min(1),
  references: z.object({
    schema: z.string().min(1),
    table: z.string().min(1),
    columns: z.array(z.string().min(1)).min(1),
  }),
  onDelete: foreignKeyActionSchema.optional(),
  onUpdate: foreignKeyActionSchema.optional(),
})

export const tableIndexSchema = z.object({
  name: z.string().min(1),
  unique: z.boolean(),
  method: z.string().min(1),
  columns: z.array(z.string().min(1)).min(1),
  where: optionalText,
})

const tableChecksSchema = z.preprocess(
  (value) => (Array.isArray(value)
    ? value.filter((item) => {
      const expression = (item as { expression?: unknown } | null)?.expression
      return typeof expression !== 'string' || expression.trim() !== ''
    })
    : value),
  z.array(tableCheckSchema),
)

export const tableDefinitionSchema = z.object({
  columns: z.array(tableColumnSchema),
  primaryKey: tablePrimaryKeySchema.optional(),
  uniques: z.array(tableUniqueSchema),
  checks: tableChecksSchema,
  foreignKeys: z.array(tableForeignKeySchema),
  indexes: z.array(tableIndexSchema),
})

export type ForeignKeyAction = z.infer<typeof foreignKeyActionSchema>
export type TableColumn = z.infer<typeof tableColumnSchema>
export type TablePrimaryKey = z.infer<typeof tablePrimaryKeySchema>
export type TableUnique = z.infer<typeof tableUniqueSchema>
export type TableCheck = z.infer<typeof tableCheckSchema>
export type TableForeignKey = z.infer<typeof tableForeignKeySchema>
export type TableIndex = z.infer<typeof tableIndexSchema>
export type TableDefinition = z.infer<typeof tableDefinitionSchema>

export function emptyTableDefinition(): TableDefinition {
  return {
    columns: [],
    uniques: [],
    checks: [],
    foreignKeys: [],
    indexes: [],
  }
}

function presentText(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === '' ? undefined : value
}

function withoutBlankName<T extends { name?: string }>(item: T): T {
  const { name, ...rest } = item
  const nextName = presentText(name)
  return {
    ...rest,
    ...(nextName !== undefined ? { name: nextName } : {}),
  } as T
}

export function normalizeTableDefinition(definition: TableDefinition): TableDefinition {
  return {
    columns: definition.columns.map((column) => {
      const { default: defaultValue, generated, comment, ...rest } = column
      const nextDefault = presentText(defaultValue)
      const nextGenerated = presentText(generated)
      const nextComment = presentText(comment)
      return {
        ...rest,
        ...(nextDefault !== undefined ? { default: nextDefault } : {}),
        ...(nextGenerated !== undefined ? { generated: nextGenerated } : {}),
        ...(nextComment !== undefined ? { comment: nextComment } : {}),
      }
    }),
    ...(definition.primaryKey && definition.primaryKey.columns.length > 0
      ? { primaryKey: withoutBlankName(definition.primaryKey) }
      : {}),
    uniques: definition.uniques
      .filter((unique) => unique.columns.length > 0)
      .map(withoutBlankName),
    checks: definition.checks
      .filter((check) => presentText(check.expression) !== undefined)
      .map(withoutBlankName),
    foreignKeys: definition.foreignKeys.map(withoutBlankName),
    indexes: definition.indexes.map((index) => {
      const { where, ...rest } = index
      const nextWhere = presentText(where)
      return {
        ...rest,
        ...(nextWhere !== undefined ? { where: nextWhere } : {}),
      }
    }),
  }
}

export function tableDefinitionFromUnknown(value: unknown): TableDefinition | undefined {
  const parsed = tableDefinitionSchema.safeParse(value)
  return parsed.success ? normalizeTableDefinition(parsed.data) : undefined
}

export function tableDefinitionError(value: unknown): string | undefined {
  const parsed = tableDefinitionSchema.safeParse(value)
  if (parsed.success) return undefined
  return parsed.error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''
      return `${path}${issue.message}`
    })
    .join('; ') || 'Invalid table Definition.'
}

export function parseTableDefinition(source: unknown): TableDefinition | undefined {
  if (typeof source === 'string') {
    if (!source.trim()) return emptyTableDefinition()
    try {
      return tableDefinitionFromUnknown(JSON.parse(source))
    } catch {
      return undefined
    }
  }
  return tableDefinitionFromUnknown(source)
}

export function stringifyTableDefinition(definition: TableDefinition): string {
  return JSON.stringify(normalizeTableDefinition(definition), null, 2)
}

export function nodeTableDefinition(node: CanvasNode): TableDefinition | undefined {
  return parseTableDefinition(getEntityMeta(node)?.fields.definition)
}

export function stringField(node: CanvasNode, key: string): string {
  const value = getEntityMeta(node)?.fields[key]
  return value == null ? '' : String(value)
}

export function schemaName(node: CanvasNode): string {
  return stringField(node, 'schema').trim() || 'public'
}

export function tableKey(schema: string, table: string): string {
  return `${schema}\u0000${table}`
}

const HANDLE_PREFIX = 'db-col:'

export function databaseColumnHandleId(
  column: string,
  side: 'left' | 'right',
): string {
  return `${HANDLE_PREFIX}${side}:${column}`
}

export function columnFromDatabaseHandle(handle: string | null | undefined): string | undefined {
  if (!handle || !handle.startsWith(HANDLE_PREFIX)) return undefined
  const rest = handle.slice(HANDLE_PREFIX.length)
  const separator = rest.indexOf(':')
  if (separator < 0) return undefined
  const side = rest.slice(0, separator)
  if (side !== 'left' && side !== 'right') return undefined
  return rest.slice(separator + 1) || undefined
}

export function isDatabaseColumnHandle(handle: string | null | undefined): boolean {
  return Boolean(handle?.startsWith(HANDLE_PREFIX))
}
