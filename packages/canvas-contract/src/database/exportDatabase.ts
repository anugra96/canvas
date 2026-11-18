import type { CanvasNode, JsonCanvas } from '../jsonCanvas'
import { getEntityMeta } from '../ontology'
import type { ForeignKeyAction, TableColumn, TableDefinition } from './model'
import { nodeTableDefinition, schemaName, stringField } from './model'

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

export function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

function qualified(schema: string, name: string): string {
  return `${quoteIdentifier(schema)}.${quoteIdentifier(name)}`
}

function nodeType(node: CanvasNode): string {
  return getEntityMeta(node)?.entityType ?? ''
}

function tables(canvas: JsonCanvas): CanvasNode[] {
  return (canvas.nodes ?? [])
    .filter((node) => nodeType(node) === 'table')
    .sort((left, right) =>
      schemaName(left).localeCompare(schemaName(right))
      || stringField(left, 'name').localeCompare(stringField(right, 'name')))
}

function enums(canvas: JsonCanvas): CanvasNode[] {
  return (canvas.nodes ?? [])
    .filter((node) => nodeType(node) === 'db_enum')
    .sort((left, right) =>
      schemaName(left).localeCompare(schemaName(right))
      || stringField(left, 'name').localeCompare(stringField(right, 'name')))
}

function schemas(canvas: JsonCanvas): Array<{ name: string; description: string }> {
  const names = new Map<string, string>()
  for (const node of canvas.nodes ?? []) {
    if (nodeType(node) === 'db_schema') {
      names.set(stringField(node, 'name'), stringField(node, 'description'))
    }
  }
  for (const node of canvas.nodes ?? []) {
    if (nodeType(node) === 'table' || nodeType(node) === 'db_enum') {
      const name = schemaName(node)
      if (!names.has(name)) names.set(name, '')
    }
  }
  return [...names.entries()]
    .filter(([name]) => name.trim() !== '')
    .map(([name, description]) => ({ name, description }))
    .sort((left, right) => left.name.localeCompare(right.name))
}

function columnSql(column: TableColumn): string {
  const parts = [quoteIdentifier(column.name), column.type]
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
): string {
  const parts: string[] = definition.columns.map(columnSql)
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
  const database = (canvas.nodes ?? []).find((node) => nodeType(node) === 'database_definition')
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
  const database = (canvas.nodes ?? []).find((node) => nodeType(node) === 'database_definition')
  const statements: string[] = []
  statements.push(...extensionStatements(canvas))

  for (const schema of schemas(canvas)) {
    statements.push(`CREATE SCHEMA ${quoteIdentifier(schema.name)};`)
  }

  for (const item of enums(canvas)) {
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

  const definitions = new Map<string, TableDefinition>()
  for (const node of tables(canvas)) {
    const name = stringField(node, 'name')
    if (!name) continue
    const definition = nodeTableDefinition(node)
    if (!definition) {
      throw new Error(`Table "${schemaName(node)}.${name}" has an invalid Definition.`)
    }
    definitions.set(node.id, definition)
    statements.push(tableSql(schemaName(node), name, definition))
  }

  for (const node of tables(canvas)) {
    const name = stringField(node, 'name')
    const definition = definitions.get(node.id)
    if (!name || !definition) continue
    statements.push(...foreignKeySql(schemaName(node), name, definition))
  }

  for (const node of tables(canvas)) {
    const name = stringField(node, 'name')
    const definition = definitions.get(node.id)
    if (!name || !definition) continue
    statements.push(...indexSql(schemaName(node), name, definition))
  }

  for (const schema of schemas(canvas)) {
    if (schema.description.trim()) {
      statements.push(`COMMENT ON SCHEMA ${quoteIdentifier(schema.name)} IS ${quoteLiteral(schema.description)};`)
    }
  }
  for (const item of enums(canvas)) {
    const name = stringField(item, 'name')
    if (!name) continue
    const description = stringField(item, 'description')
    if (description.trim()) {
      statements.push(`COMMENT ON TYPE ${qualified(schemaName(item), name)} IS ${quoteLiteral(description)};`)
    }
  }
  for (const node of tables(canvas)) {
    const name = stringField(node, 'name')
    const definition = definitions.get(node.id)
    if (!name || !definition) continue
    const description = stringField(node, 'description')
    if (description.trim()) {
      statements.push(`COMMENT ON TABLE ${qualified(schemaName(node), name)} IS ${quoteLiteral(description)};`)
    }
    for (const column of definition.columns) {
      if (!column.comment?.trim()) continue
      statements.push(
        `COMMENT ON COLUMN ${qualified(schemaName(node), name)}.${quoteIdentifier(column.name)} IS ${quoteLiteral(column.comment)};`,
      )
    }
  }

  const extra = database ? stringField(database, 'extra').trim() : ''
  if (extra) statements.push(extra)

  return `${statements.join('\n\n')}\n`
}
