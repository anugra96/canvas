import type { JsonCanvas } from '../jsonCanvas'
import { canvasDatabaseTarget } from '../databaseTarget'
import type { ForeignKeyAction, TableColumn, TableDefinition } from './model'
import { schemaName, stringField } from './model'
import {
  databaseDefinition,
  databaseEnums,
  databaseSchemas,
  databaseTableDefinitions,
  quoteLiteral,
} from './exportShared'
import { exportSqliteDdl } from './targets/sqlite'
import { databaseTargetAdapter, type DatabaseTargetAdapter } from './targets'

const RESERVED = new Set([
  'all', 'analyse', 'analyze', 'and', 'any', 'array', 'as', 'asc', 'asymmetric',
  'authorization', 'binary', 'both', 'case', 'cast', 'check', 'collate', 'collation',
  'column', 'concurrently', 'constraint', 'create', 'cross', 'current_catalog',
  'current_date', 'current_role', 'current_schema', 'current_time', 'current_timestamp',
  'current_user', 'default', 'deferrable', 'desc', 'distinct', 'do', 'else', 'end',
  'except', 'false', 'fetch', 'for', 'foreign', 'freeze', 'from', 'full', 'grant',
  'group', 'having', 'ilike', 'in', 'initially', 'inner', 'intersect', 'into', 'is',
  'isnull', 'join', 'lateral', 'leading', 'left', 'like', 'limit', 'localtime',
  'localtimestamp', 'natural', 'not', 'notnull', 'null', 'offset', 'on', 'only', 'or',
  'order', 'outer', 'overlaps', 'placing', 'primary', 'references', 'returning',
  'right', 'select', 'session_user', 'similar', 'some', 'symmetric', 'table',
  'tablesample', 'then', 'to', 'trailing', 'true', 'union', 'unique', 'user', 'using',
  'variadic', 'verbose', 'when', 'where', 'window', 'with',
])

export function quoteIdentifier(value: string): string {
  if (/^[a-z_][a-z0-9_$]*$/.test(value) && !RESERVED.has(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}

export { quoteLiteral }

function qualified(schema: string, name: string): string {
  return `${quoteIdentifier(schema)}.${quoteIdentifier(name)}`
}

function columnSql(column: TableColumn, adapter: DatabaseTargetAdapter | undefined): string {
  const type = adapter ? adapter.typeFor(column.type) : column.type
  const parts = [quoteIdentifier(column.name), type]
  if (column.generated?.trim()) {
    parts.push(`GENERATED ALWAYS AS (${column.generated}) STORED`)
  } else if (column.identity) {
    parts.push(`GENERATED ${column.identity === 'always' ? 'ALWAYS' : 'BY DEFAULT'} AS IDENTITY`)
  } else if (column.default?.trim()) {
    parts.push(`DEFAULT ${column.default}`)
  }
  if (!column.nullable) parts.push('NOT NULL')
  return parts.join(' ')
}

function namedConstraint(name: string | undefined): string {
  return name ? `CONSTRAINT ${quoteIdentifier(name)} ` : ''
}

function tableSql(
  schema: string,
  name: string,
  definition: TableDefinition,
  adapter: DatabaseTargetAdapter | undefined,
): string {
  const parts: string[] = definition.columns.map((column) => columnSql(column, adapter))
  if (definition.primaryKey && definition.primaryKey.columns.length > 0) {
    parts.push(
      `${namedConstraint(definition.primaryKey.name)}PRIMARY KEY (${definition.primaryKey.columns.map(quoteIdentifier).join(', ')})`,
    )
  }
  for (const unique of definition.uniques) {
    if (unique.columns.length === 0) continue
    parts.push(
      `${namedConstraint(unique.name)}UNIQUE (${unique.columns.map(quoteIdentifier).join(', ')})`,
    )
  }
  for (const check of definition.checks) {
    if (!check.expression.trim()) continue
    parts.push(`${namedConstraint(check.name)}CHECK (${check.expression})`)
  }
  return `CREATE TABLE ${qualified(schema, name)} (\n    ${parts.join(',\n    ')}\n);`
}

function actionText(action: ForeignKeyAction | undefined): string {
  if (!action || action === 'no_action') return ''
  return action.replaceAll('_', ' ')
}

function foreignKeySql(
  childSchema: string,
  childName: string,
  definition: TableDefinition,
): string[] {
  return definition.foreignKeys.flatMap((foreignKey) => {
    if (foreignKey.columns.length === 0) return []
    const actions = [
      actionText(foreignKey.onDelete) ? `ON DELETE ${actionText(foreignKey.onDelete).toUpperCase()}` : '',
      actionText(foreignKey.onUpdate) ? `ON UPDATE ${actionText(foreignKey.onUpdate).toUpperCase()}` : '',
    ].filter(Boolean)
    return [
      `ALTER TABLE ${qualified(childSchema, childName)} ADD ${namedConstraint(foreignKey.name)}FOREIGN KEY (${foreignKey.columns.map(quoteIdentifier).join(', ')}) REFERENCES ${qualified(foreignKey.references.schema, foreignKey.references.table)} (${foreignKey.references.columns.map(quoteIdentifier).join(', ')})${actions.length ? ` ${actions.join(' ')}` : ''};`,
    ]
  })
}

function indexSql(schema: string, name: string, definition: TableDefinition): string[] {
  return definition.indexes.map((index) => {
    const where = index.where?.trim() ? ` WHERE ${index.where}` : ''
    return `CREATE ${index.unique ? 'UNIQUE ' : ''}INDEX ${quoteIdentifier(index.name)} ON ${qualified(schema, name)} USING ${index.method} (${index.columns.join(', ')})${where};`
  })
}

function extensionStatements(canvas: JsonCanvas): string[] {
  const database = databaseDefinition(canvas)
  if (!database) return []
  return stringField(database, 'extensions')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, ...rest] = line.split(/\s+/)
      if (!name) return ''
      const schema = rest.find((token) => token.includes('.') || token)?.replace(/^schema=/, '')
      return `CREATE EXTENSION IF NOT EXISTS ${quoteIdentifier(name)}${schema ? ` WITH SCHEMA ${quoteIdentifier(schema)}` : ''};`
    })
    .filter(Boolean)
}

export function exportDatabaseDdl(canvas: JsonCanvas): string {
  if (canvasDatabaseTarget(canvas) === 'sqlite') return exportSqliteDdl(canvas)
  const database = databaseDefinition(canvas)
  const adapter = databaseTargetAdapter(canvasDatabaseTarget(canvas))
  const tableItems = databaseTableDefinitions(canvas)
  const statements: string[] = []
  statements.push(...extensionStatements(canvas))

  for (const schema of databaseSchemas(canvas)) {
    statements.push(`CREATE SCHEMA ${quoteIdentifier(schema.name)};`)
  }

  for (const item of databaseEnums(canvas)) {
    const name = stringField(item, 'name')
    if (!name) continue
    const values = stringField(item, 'values')
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean)
    statements.push(
      `CREATE TYPE ${qualified(schemaName(item), name)} AS ENUM (${values.map(quoteLiteral).join(', ')});`,
    )
  }

  for (const { schema, name, definition } of tableItems) {
    statements.push(tableSql(schema, name, definition, adapter))
  }

  for (const { schema, name, definition } of tableItems) {
    statements.push(...foreignKeySql(schema, name, definition))
  }

  for (const { schema, name, definition } of tableItems) {
    statements.push(...indexSql(schema, name, definition))
  }

  for (const schema of databaseSchemas(canvas)) {
    if (schema.description.trim()) {
      statements.push(`COMMENT ON SCHEMA ${quoteIdentifier(schema.name)} IS ${quoteLiteral(schema.description)};`)
    }
  }
  for (const item of databaseEnums(canvas)) {
    const name = stringField(item, 'name')
    if (!name) continue
    const description = stringField(item, 'description')
    if (description.trim()) {
      statements.push(`COMMENT ON TYPE ${qualified(schemaName(item), name)} IS ${quoteLiteral(description)};`)
    }
  }
  for (const { node, schema, name, definition } of tableItems) {
    const description = stringField(node, 'description')
    if (description.trim()) {
      statements.push(`COMMENT ON TABLE ${qualified(schema, name)} IS ${quoteLiteral(description)};`)
    }
    for (const column of definition.columns) {
      if (!column.comment?.trim()) continue
      statements.push(
        `COMMENT ON COLUMN ${qualified(schema, name)}.${quoteIdentifier(column.name)} IS ${quoteLiteral(column.comment)};`,
      )
    }
  }

  const extra = database ? stringField(database, 'extra').trim() : ''
  if (extra) statements.push(extra)

  return `${statements.join('\n\n')}\n`
}
