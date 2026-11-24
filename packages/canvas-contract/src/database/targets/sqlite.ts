import type { CanvasNode, JsonCanvas } from '../../jsonCanvas'
import type { ColumnTypeClassification } from '../columnTypes'
import { classifyColumnType } from '../columnTypes'
import {
  databaseDefinition,
  databaseEnums,
  databaseSchemas,
  databaseTableDefinitions,
  enumValues,
  quoteLiteral,
  type DatabaseTable,
} from '../exportShared'
import type { TableCheck, TableColumn, TableForeignKey, TableIndex } from '../model'
import { stringField } from '../model'
import type { DatabaseTargetAdapter } from './types'

export type SqliteIssueCode =
  | 'sqlite_namespace_flattened'
  | 'sqlite_name_collision'
  | 'sqlite_decimal_text'
  | 'sqlite_type_any'
  | 'sqlite_identity_dropped'
  | 'sqlite_default_unsupported'
  | 'sqlite_expression_unsupported'
  | 'sqlite_index_method'
  | 'sqlite_postgres_only'

export interface SqliteTargetIssue {
  code: SqliteIssueCode
  severity: 'warning' | 'error'
  message: string
  nodeId: string
  commentedOut: boolean
}

export interface SqliteColumnTypePlan {
  sqlType: string
  checks: string[]
  warning?: { code: 'sqlite_decimal_text' | 'sqlite_type_any'; detail: string }
}

export interface SqliteColumnPlan {
  column: TableColumn
  sqlType: string
  checks: string[]
  rowid: boolean
  defaultSql?: string
  generated?: string
}

export interface SqliteIndexPlan {
  index: TableIndex
  keep: boolean
  issue?: SqliteTargetIssue
}

export interface SqliteTablePlan {
  table: DatabaseTable
  exportName: string
  columns: SqliteColumnPlan[]
  primaryKeyColumns?: string[]
  primaryKeyName?: string
  checks: TableCheck[]
  indexes: SqliteIndexPlan[]
  issues: SqliteTargetIssue[]
}

export interface SqliteExportPlan {
  tables: SqliteTablePlan[]
  issues: SqliteTargetIssue[]
  extensionIssues: SqliteTargetIssue[]
  extraIssue?: SqliteTargetIssue
  extra: string
  database?: CanvasNode
}

const SQLITE_RESERVED = new Set([
  'abort', 'action', 'add', 'after', 'all', 'alter', 'always', 'analyze', 'and',
  'as', 'asc', 'attach', 'autoincrement', 'before', 'begin', 'between', 'by',
  'cascade', 'case', 'cast', 'check', 'collate', 'column', 'commit', 'conflict',
  'constraint', 'create', 'cross', 'current', 'current_date', 'current_time',
  'current_timestamp', 'database', 'default', 'deferrable', 'deferred', 'delete',
  'desc', 'detach', 'distinct', 'do', 'drop', 'each', 'else', 'end', 'escape',
  'except', 'exclude', 'exclusive', 'exists', 'explain', 'fail', 'filter', 'first',
  'following', 'for', 'foreign', 'from', 'full', 'generated', 'glob', 'group',
  'groups', 'having', 'if', 'ignore', 'immediate', 'in', 'index', 'indexed',
  'initially', 'inner', 'insert', 'instead', 'intersect', 'into', 'is', 'isnull',
  'join', 'key', 'last', 'left', 'like', 'limit', 'match', 'materialized',
  'natural', 'no', 'not', 'nothing', 'notnull', 'null', 'nulls', 'of', 'offset',
  'on', 'or', 'order', 'others', 'outer', 'over', 'partition', 'plan', 'pragma',
  'preceding', 'primary', 'query', 'raise', 'range', 'recursive', 'references',
  'regexp', 'reindex', 'release', 'rename', 'replace', 'restrict', 'right',
  'rollback', 'row', 'rows', 'savepoint', 'select', 'set', 'table', 'temp',
  'temporary', 'then', 'ties', 'to', 'transaction', 'trigger', 'unbounded',
  'union', 'unique', 'update', 'using', 'vacuum', 'values', 'view', 'virtual',
  'when', 'where', 'window', 'with', 'without',
])

const SQLITE_FUNCTIONS = new Set([
  'abs', 'acos', 'acosh', 'asin', 'asinh', 'atan', 'atan2', 'atanh', 'avg', 'cast',
  'ceil', 'ceiling', 'changes', 'char', 'coalesce', 'concat', 'concat_ws', 'cos',
  'cosh', 'count', 'cume_dist', 'date', 'datetime', 'dense_rank', 'degrees', 'exp',
  'first_value', 'floor', 'format', 'glob', 'group_concat', 'hex', 'ifnull', 'iif',
  'instr', 'json', 'json_array', 'json_array_length', 'json_error_position',
  'json_extract', 'json_group_array', 'json_group_object', 'json_insert',
  'json_object', 'json_patch', 'json_quote', 'json_remove', 'json_replace',
  'json_set', 'json_type', 'json_valid', 'julianday', 'lag', 'last_insert_rowid',
  'last_value', 'lead', 'length', 'like', 'likelihood', 'likely', 'ln', 'log',
  'log10', 'log2', 'lower', 'ltrim', 'max', 'min', 'mod', 'nth_value', 'ntile',
  'nullif', 'octet_length', 'percent_rank', 'pow', 'power', 'printf', 'quote',
  'radians', 'random', 'randomblob', 'rank', 'replace', 'round', 'row_number',
  'rtrim', 'sign', 'sin', 'sinh', 'soundex', 'sqlite_compileoption_get',
  'sqlite_compileoption_used', 'sqlite_source_id', 'sqlite_version', 'sqrt',
  'strftime', 'string_agg', 'substr', 'substring', 'sum', 'tan', 'tanh', 'time',
  'timediff', 'total', 'total_changes', 'trim', 'trunc', 'typeof', 'unhex',
  'unicode', 'unixepoch', 'unlikely', 'upper', 'zeroblob',
])

const SQLITE_CAST_TYPES = new Set([
  'bigint', 'blob', 'boolean', 'char', 'character', 'clob', 'date', 'datetime',
  'decimal', 'double', 'float', 'int', 'integer', 'mediumint', 'nchar', 'numeric',
  'nvarchar', 'real', 'smallint', 'text', 'time', 'timestamp', 'tinyint', 'varchar',
])

const NOT_FUNCTIONS = new Set([
  'and', 'as', 'asc', 'between', 'by', 'case', 'collate', 'desc', 'distinct',
  'else', 'end', 'exists', 'filter', 'from', 'in', 'is', 'like', 'not', 'null',
  'on', 'or', 'order', 'over', 'partition', 'select', 'then', 'using', 'when',
  'where',
])

export function quoteSqliteIdentifier(value: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_$]*$/.test(value) && !SQLITE_RESERVED.has(value.toLowerCase())) {
    return value
  }
  return `"${value.replaceAll('"', '""')}"`
}

function tableName(table: { schema: string; name: string }): string {
  return table.schema === 'public' ? table.name : `${table.schema}_${table.name}`
}

function typePlanFor(
  classification: ColumnTypeClassification,
  enumValuesByName: ReadonlyMap<string, readonly string[]>,
  columnName: string,
): SqliteColumnTypePlan {
  const column = quoteSqliteIdentifier(columnName)
  if (classification.kind === 'enum') {
    const values = enumValuesByName.get(classification.name) ?? []
    return {
      sqlType: 'TEXT',
      checks: values.length > 0
        ? [`${column} IN (${values.map(quoteLiteral).join(', ')})`]
        : [],
    }
  }
  if (classification.kind === 'native') {
    const native = classification.type.toLowerCase()
    switch (native) {
      case 'smallint':
        return { sqlType: 'INTEGER', checks: [] }
      case 'real':
      case 'double precision':
        return { sqlType: 'REAL', checks: [] }
      case 'jsonb':
        return { sqlType: 'TEXT', checks: [`json_valid(${column})`] }
      case 'time':
      case 'time with time zone':
      case 'time without time zone':
      case 'interval':
      case 'inet':
      case 'cidr':
      case 'macaddr':
        return { sqlType: 'TEXT', checks: [] }
      default:
        return {
          sqlType: 'ANY',
          checks: [],
          warning: { code: 'sqlite_type_any', detail: classification.type },
        }
    }
  }
  switch (classification.type) {
    case 'text':
      return { sqlType: 'TEXT', checks: [] }
    case 'varchar':
      return {
        sqlType: 'TEXT',
        checks: classification.length === undefined
          ? []
          : [`length(${column}) <= ${classification.length}`],
      }
    case 'integer':
    case 'bigint':
      return { sqlType: 'INTEGER', checks: [] }
    case 'decimal':
      return {
        sqlType: 'TEXT',
        checks: [],
        warning: { code: 'sqlite_decimal_text', detail: classification.type },
      }
    case 'boolean':
      return { sqlType: 'INTEGER', checks: [`${column} IN (0, 1)`] }
    case 'json':
      return { sqlType: 'TEXT', checks: [`json_valid(${column})`] }
    case 'binary':
      return { sqlType: 'BLOB', checks: [] }
    case 'uuid':
    case 'date':
    case 'timestamp':
      return { sqlType: 'TEXT', checks: [] }
  }
}

export function sqliteColumnTypePlan(
  columnType: string,
  enumValuesByName: ReadonlyMap<string, readonly string[]> = new Map(),
  columnName = 'value',
): SqliteColumnTypePlan {
  const classification = classifyColumnType(columnType, enumValuesByName.keys())
  return typePlanFor(classification, enumValuesByName, columnName)
}

export function sqliteExpressionCheck(
  expression: string,
): { supported: boolean; reason?: string } {
  const withoutStrings = expression.replace(/'(?:[^']|'')*'/g, "''")
  if (withoutStrings.includes('::')) return { supported: false, reason: 'the :: cast' }
  if (/(^|[^~!])!?~(?![~])/.test(withoutStrings)) {
    return { supported: false, reason: 'the ~ operator' }
  }
  if (/\bilike\b/i.test(withoutStrings)) return { supported: false, reason: 'the ILIKE operator' }
  if (/\bsimilar\s+to\b/i.test(withoutStrings)) return { supported: false, reason: 'SIMILAR TO' }

  const casts = withoutStrings.matchAll(
    /\bcast\s*\([^)]*\bas\s+([A-Za-z_][A-Za-z0-9_$]*(?:\.[A-Za-z_][A-Za-z0-9_$]*)*)/gi,
  )
  for (const match of casts) {
    const target = match[1]!
    if (target.includes('.') || !SQLITE_CAST_TYPES.has(target.toLowerCase())) {
      return { supported: false, reason: `the cast to "${target}"` }
    }
  }

  const functions = withoutStrings.matchAll(/\b([A-Za-z_][A-Za-z0-9_$]*)\s*\(/g)
  for (const match of functions) {
    const functionName = match[1]!
    const normalized = functionName.toLowerCase()
    if (NOT_FUNCTIONS.has(normalized)) continue
    if (!SQLITE_FUNCTIONS.has(normalized)) {
      return { supported: false, reason: `the function "${functionName}()"` }
    }
  }
  return { supported: true }
}

function sqliteDefault(value: string): { supported: boolean; sql?: string } {
  const text = value.trim()
  const lower = text.toLowerCase()
  if (lower === 'now()' || lower === 'current_timestamp' || lower === 'current_timestamp()') {
    return { supported: true, sql: 'CURRENT_TIMESTAMP' }
  }
  if (lower === 'current_date' || lower === 'current_date()') {
    return { supported: true, sql: 'CURRENT_DATE' }
  }
  if (lower === 'current_time' || lower === 'current_time()') {
    return { supported: true, sql: 'CURRENT_TIME' }
  }
  if (lower === 'true') return { supported: true, sql: '1' }
  if (lower === 'false') return { supported: true, sql: '0' }
  if (lower === 'null') return { supported: true, sql: 'NULL' }
  if (/^'(?:[^']|'')*'$/.test(text)) return { supported: true, sql: text }
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) {
    return { supported: true, sql: text }
  }
  if (/^[xX]'[0-9a-fA-F]*'$/.test(text)) return { supported: true, sql: text }
  return { supported: false }
}

function actionText(action: TableForeignKey['onDelete']): string {
  if (!action || action === 'no_action') return ''
  return action.replaceAll('_', ' ').toUpperCase()
}

function indexColumn(value: string): string {
  const trimmed = value.trim()
  if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(trimmed)) return trimmed
  return quoteSqliteIdentifier(trimmed)
}

function formatList(values: string[]): string {
  if (values.length <= 1) return values[0] ?? ''
  return `${values.slice(0, -1).join(', ')} and ${values.at(-1)}`
}

function enumNameMap(
  canvas: Pick<JsonCanvas, 'nodes'>,
): Map<string, readonly string[]> {
  const names = new Map<string, readonly string[]>()
  for (const node of databaseEnums(canvas)) {
    const values = enumValues(node)
    const enumName = stringField(node, 'name').trim()
    if (!enumName) continue
    const schema = stringField(node, 'schema').trim() || 'public'
    names.set(`${schema}.${enumName}`, values)
    if (schema === 'public' && !names.has(enumName)) names.set(enumName, values)
  }
  return names
}

export function planSqliteExport(canvas: Pick<JsonCanvas, 'nodes'>): SqliteExportPlan {
  const database = databaseDefinition(canvas)
  const enumNames = enumNameMap(canvas)
  const extensionIssues: SqliteTargetIssue[] = []
  if (database) {
    for (const line of stringField(database, 'extensions').split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const extensionName = trimmed.split(/\s+/)[0] ?? trimmed
      extensionIssues.push({
        code: 'sqlite_postgres_only',
        severity: 'warning',
        message: `Extension "${extensionName}" has no SQLite equivalent; the export leaves it out.`,
        nodeId: database.id,
        commentedOut: true,
      })
    }
  }

  const tables = databaseTableDefinitions(canvas)
  const exportNames = new Map<string, DatabaseTable[]>()
  for (const table of tables) {
    const flattened = tableName(table)
    const current = exportNames.get(flattened) ?? []
    current.push(table)
    exportNames.set(flattened, current)
  }

  const tablePlans: SqliteTablePlan[] = []
  const issues: SqliteTargetIssue[] = [...extensionIssues]
  for (const table of tables) {
    const exportName = tableName(table)
    const tableIssues: SqliteTargetIssue[] = []
    if (table.schema !== 'public') {
      tableIssues.push({
        code: 'sqlite_namespace_flattened',
        severity: 'warning',
        message: `Schema "${table.schema}" is not available in SQLite; table "${table.schema}.${table.name}" is exported as "${exportName}".`,
        nodeId: table.node.id,
        commentedOut: false,
      })
    }
    const colliding = exportNames.get(exportName) ?? []
    if (colliding.length > 1) {
      const others = colliding
        .filter((candidate) => candidate !== table)
        .map((candidate) => `"${candidate.schema}.${candidate.name}"`)
      tableIssues.push({
        code: 'sqlite_name_collision',
        severity: 'error',
        message: `Tables ${formatList(others)} and "${table.schema}.${table.name}" both export as "${exportName}" in SQLite; rename one.`,
        nodeId: table.node.id,
        commentedOut: false,
      })
    }

    const definition = table.definition
    const pkColumns = definition.primaryKey?.columns ?? []
    const rowidName = pkColumns.length === 1 ? pkColumns[0] : undefined
    const columnPlans: SqliteColumnPlan[] = definition.columns.map((column) => {
      const classification = classifyColumnType(column.type, enumNames.keys())
      const typePlan = typePlanFor(classification, enumNames, column.name)
      const rowid = Boolean(
        column.identity
        && column.name === rowidName
        && classification.kind === 'neutral'
        && (classification.type === 'integer' || classification.type === 'bigint'),
      )
      if (typePlan.warning?.code === 'sqlite_decimal_text') {
        tableIssues.push({
          code: 'sqlite_decimal_text',
          severity: 'warning',
          message: `Column "${column.name}" on "${exportName}" is ${column.type}; SQLite stores it as TEXT, so values compare and sort as text.`,
          nodeId: table.node.id,
          commentedOut: false,
        })
      }
      if (typePlan.warning?.code === 'sqlite_type_any') {
        tableIssues.push({
          code: 'sqlite_type_any',
          severity: 'warning',
          message: `Column "${column.name}" on "${exportName}" uses native type "${typePlan.warning.detail}"; SQLite has no equivalent, so the export writes ANY.`,
          nodeId: table.node.id,
          commentedOut: false,
        })
      }
      let generated: string | undefined
      if (column.generated?.trim()) {
        const check = sqliteExpressionCheck(column.generated)
        if (check.supported) generated = column.generated
        else {
          tableIssues.push({
            code: 'sqlite_expression_unsupported',
            severity: 'warning',
            message: `Generated expression on "${exportName}"."${column.name}" uses ${check.reason}; the export leaves it out.`,
            nodeId: table.node.id,
            commentedOut: true,
          })
        }
      }
      let defaultSql: string | undefined
      if (!generated && column.identity && !rowid) {
        tableIssues.push({
          code: 'sqlite_identity_dropped',
          severity: 'warning',
          message: `Identity on "${exportName}"."${column.name}" has no SQLite form; the export leaves it out.`,
          nodeId: table.node.id,
          commentedOut: true,
        })
      } else if (!generated && !column.identity && column.default?.trim()) {
        const planned = sqliteDefault(column.default)
        if (planned.supported) defaultSql = planned.sql
        else {
          tableIssues.push({
            code: 'sqlite_default_unsupported',
            severity: 'warning',
            message: `Default ${column.default.trim()} on "${exportName}"."${column.name}" has no SQLite equivalent; the export leaves it out.`,
            nodeId: table.node.id,
            commentedOut: true,
          })
        }
      }
      return {
        column,
        sqlType: typePlan.sqlType,
        checks: typePlan.checks,
        rowid,
        ...(defaultSql !== undefined ? { defaultSql } : {}),
        ...(generated !== undefined ? { generated } : {}),
      }
    })

    const checks: TableCheck[] = []
    for (const check of definition.checks) {
      if (!check.expression.trim()) continue
      const planned = sqliteExpressionCheck(check.expression)
      if (planned.supported) {
        checks.push(check)
        continue
      }
      const label = check.name ? `Check "${check.name}"` : `Check (${check.expression.trim()})`
      tableIssues.push({
        code: 'sqlite_expression_unsupported',
        severity: 'warning',
        message: `${label} on "${exportName}" uses ${planned.reason}; the export leaves it out.`,
        nodeId: table.node.id,
        commentedOut: true,
      })
    }

    const indexes: SqliteIndexPlan[] = definition.indexes.map((index) => {
      if (index.method.trim().toLowerCase() !== 'btree') {
        return {
          index,
          keep: false,
          issue: {
            code: 'sqlite_index_method',
            severity: 'warning',
            message: `Index "${index.name}" on "${exportName}" uses method "${index.method}"; SQLite has only btree, so the export leaves it out.`,
            nodeId: table.node.id,
            commentedOut: true,
          },
        }
      }
      if (index.where?.trim()) {
        const planned = sqliteExpressionCheck(index.where)
        if (!planned.supported) {
          return {
            index,
            keep: false,
            issue: {
              code: 'sqlite_expression_unsupported',
              severity: 'warning',
              message: `Index "${index.name}" on "${exportName}" has a WHERE expression that uses ${planned.reason}; the export leaves it out.`,
              nodeId: table.node.id,
              commentedOut: true,
            },
          }
        }
      }
      return { index, keep: true }
    })

    tablePlans.push({
      table,
      exportName,
      columns: columnPlans,
      ...(rowidName ? {} : { primaryKeyColumns: pkColumns, primaryKeyName: definition.primaryKey?.name }),
      checks,
      indexes,
      issues: tableIssues,
    })
    issues.push(...tableIssues)
  }

  let extraIssue: SqliteTargetIssue | undefined
  const extra = database ? stringField(database, 'extra').trim() : ''
  if (database && extra) {
    extraIssue = {
      code: 'sqlite_postgres_only',
      severity: 'warning',
      message: 'Extra DDL has no SQLite equivalent; the export leaves it out.',
      nodeId: database.id,
      commentedOut: true,
    }
    issues.push(extraIssue)
  }

  return {
    tables: tablePlans,
    issues,
    extensionIssues,
    ...(extraIssue ? { extraIssue } : {}),
    extra,
    ...(database ? { database } : {}),
  }
}

function commentLines(value: string): string[] {
  return value.split(/\r?\n/).map((line) => `-- ${line}`)
}

function columnSql(plan: SqliteColumnPlan): string {
  const parts = [quoteSqliteIdentifier(plan.column.name), plan.sqlType]
  if (plan.rowid) {
    parts.push('PRIMARY KEY')
  } else if (plan.generated) {
    parts.push(`GENERATED ALWAYS AS (${plan.generated}) STORED`)
  } else if (plan.defaultSql !== undefined) {
    parts.push(`DEFAULT ${plan.defaultSql}`)
  }
  if (!plan.column.nullable && !plan.rowid) parts.push('NOT NULL')
  for (const check of plan.checks) parts.push(`CHECK (${check})`)
  return parts.join(' ')
}

function constraintName(value: string | undefined): string {
  return value ? `CONSTRAINT ${quoteSqliteIdentifier(value)} ` : ''
}

function foreignKeySql(
  plan: SqliteTablePlan,
  foreignKey: TableForeignKey,
): string {
  const actions = [
    actionText(foreignKey.onDelete) ? `ON DELETE ${actionText(foreignKey.onDelete)}` : '',
    actionText(foreignKey.onUpdate) ? `ON UPDATE ${actionText(foreignKey.onUpdate)}` : '',
  ].filter(Boolean)
  const referenceName = tableName({
    schema: foreignKey.references.schema,
    name: foreignKey.references.table,
  })
  return `${constraintName(foreignKey.name)}FOREIGN KEY (${foreignKey.columns.map(quoteSqliteIdentifier).join(', ')}) REFERENCES ${quoteSqliteIdentifier(referenceName)} (${foreignKey.references.columns.map(quoteSqliteIdentifier).join(', ')})${actions.length > 0 ? ` ${actions.join(' ')}` : ''}`
}

function tableSql(plan: SqliteTablePlan): string {
  const { definition } = plan.table
  const parts = plan.columns.map(columnSql)
  if (plan.primaryKeyColumns && plan.primaryKeyColumns.length > 0) {
    parts.push(
      `${constraintName(plan.primaryKeyName)}PRIMARY KEY (${plan.primaryKeyColumns.map(quoteSqliteIdentifier).join(', ')})`,
    )
  }
  for (const unique of definition.uniques) {
    if (unique.columns.length === 0) continue
    parts.push(
      `${constraintName(unique.name)}UNIQUE (${unique.columns.map(quoteSqliteIdentifier).join(', ')})`,
    )
  }
  for (const check of plan.checks) {
    parts.push(`${constraintName(check.name)}CHECK (${check.expression})`)
  }
  for (const foreignKey of definition.foreignKeys) {
    if (foreignKey.columns.length === 0) continue
    parts.push(foreignKeySql(plan, foreignKey))
  }
  return `CREATE TABLE ${quoteSqliteIdentifier(plan.exportName)} (\n    ${parts.join(',\n    ')}\n) STRICT;`
}

function indexSql(plan: SqliteTablePlan, index: TableIndex): string {
  const where = index.where?.trim() ? ` WHERE ${index.where.trim()}` : ''
  return `CREATE ${index.unique ? 'UNIQUE ' : ''}INDEX ${quoteSqliteIdentifier(index.name)} ON ${quoteSqliteIdentifier(plan.exportName)} (${index.columns.map(indexColumn).join(', ')})${where};`
}

export function exportSqliteDdl(canvas: JsonCanvas): string {
  const plan = planSqliteExport(canvas)
  const blocks: string[] = ['PRAGMA foreign_keys = ON;']

  for (const issue of plan.extensionIssues) {
    blocks.push(`-- SQLite: ${issue.message}`)
  }

  for (const schema of databaseSchemas(canvas)) {
    if (!schema.description.trim()) continue
    blocks.push(commentLines(`Schema ${schema.name}: ${schema.description}`).join('\n'))
  }

  for (const item of databaseEnums(canvas)) {
    const enumName = stringField(item, 'name')
    if (!enumName) continue
    const schema = stringField(item, 'schema').trim() || 'public'
    const values = enumValues(item)
    const header = `Enum ${schema === 'public' ? enumName : `${schema}.${enumName}`}: ${values.join(' | ')}`
    const description = stringField(item, 'description')
    blocks.push(commentLines(description.trim() ? `${header}\n${description}` : header).join('\n'))
  }

  for (const table of plan.tables) {
    const lines = [`-- Table ${table.exportName}`]
    const description = stringField(table.table.node, 'description')
    if (description.trim()) lines.push(...commentLines(description))
    for (const column of table.table.definition.columns) {
      if (!column.comment?.trim()) continue
      lines.push(...commentLines(`${column.name}: ${column.comment}`))
    }
    for (const issue of table.issues) {
      if (!issue.commentedOut) continue
      lines.push(`-- SQLite: ${issue.message}`)
    }
    lines.push(tableSql(table))
    blocks.push(lines.join('\n'))
  }

  for (const table of plan.tables) {
    for (const index of table.indexes) {
      if (index.issue) {
        blocks.push(`-- SQLite: ${index.issue.message}`)
      } else if (index.keep) {
        blocks.push(indexSql(table, index.index))
      }
    }
  }

  if (plan.extraIssue) {
    blocks.push(`-- SQLite: ${plan.extraIssue.message}`)
    blocks.push(commentLines(plan.extra).join('\n'))
  }

  return `${blocks.join('\n\n')}\n`
}

export const SQLITE_TARGET: DatabaseTargetAdapter = {
  typeFor(columnType) {
    return sqliteColumnTypePlan(columnType).sqlType
  },
}
