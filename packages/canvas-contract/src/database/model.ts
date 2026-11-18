import { z } from 'zod'

import type { CanvasNode } from '../jsonCanvas'
import { getEntityMeta } from '../ontology'

export const TABLE_DEFINITION_VERSION = 1

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
  default: z.string().optional(),
  identity: z.enum(['always', 'by_default']).optional(),
  generated: z.string().optional(),
  comment: z.string().optional(),
})

export const tablePrimaryKeySchema = z.object({
  name: z.string().optional(),
  columns: z.array(z.string().min(1)).min(1),
})

export const tableUniqueSchema = z.object({
  name: z.string().optional(),
  columns: z.array(z.string().min(1)).min(1),
})

export const tableCheckSchema = z.object({
  name: z.string().optional(),
  expression: z.string().min(1),
})

export const tableForeignKeySchema = z.object({
  name: z.string().optional(),
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
  where: z.string().optional(),
})

export const tableDefinitionSchema = z.object({
  columns: z.array(tableColumnSchema),
  primaryKey: tablePrimaryKeySchema.optional(),
  uniques: z.array(tableUniqueSchema),
  checks: z.array(tableCheckSchema),
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

export function normalizeTableDefinition(definition: TableDefinition): TableDefinition {
  return {
    columns: definition.columns,
    ...(definition.primaryKey ? { primaryKey: definition.primaryKey } : {}),
    uniques: definition.uniques,
    checks: definition.checks,
    foreignKeys: definition.foreignKeys,
    indexes: definition.indexes,
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
