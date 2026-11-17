/* eslint-disable @typescript-eslint/no-explicit-any */
import { createNodeId, type CanvasNode, type JsonCanvas } from '../jsonCanvas'
import { DATABASE_PROFILE, profileMetadata } from '../profile'
import { DEFAULT_ONTOLOGY, findEntityType, type EntityFields } from '../ontology'
import type { ForeignKeyAction, TableDefinition } from './model'
import { stringifyTableDefinition } from './model'
import { layoutDatabaseCanvas, estimateDatabaseSizes } from './layout'
import { withManagedReferences } from './managedRelations'
import { loadDatabaseParser, type DatabaseParser } from './parser'
import type { ParseResult } from 'libpg-query'

export interface DatabaseColumnSummary {
  name: string
  type: string
  nullable: boolean
  default?: string
  identity?: 'always' | 'by_default'
  generated?: string
  comment?: string
}

export interface DatabaseForeignKeySummary {
  name?: string
  columns: string[]
  references: { schema: string; table: string; columns: string[] }
  onDelete?: ForeignKeyAction
  onUpdate?: ForeignKeyAction
}

export interface DatabaseIndexSummary {
  name: string
  unique: boolean
  method: string
  columns: string[]
  where?: string
}

export interface DatabaseTableSummary {
  schema: string
  name: string
  comment?: string
  columns: DatabaseColumnSummary[]
  primaryKey?: { name?: string; columns: string[] }
  uniques: Array<{ name?: string; columns: string[] }>
  checks: Array<{ name?: string; expression: string }>
  foreignKeys: DatabaseForeignKeySummary[]
  indexes: DatabaseIndexSummary[]
}

export interface DatabaseEnumSummary {
  schema: string
  name: string
  values: string[]
  comment?: string
}

export interface DatabaseSchemaSummary {
  databaseVersion?: string
  schemas: Array<{ name: string; comment?: string }>
  enums: DatabaseEnumSummary[]
  tables: DatabaseTableSummary[]
  extensions: Array<{ name: string; schema?: string }>
  extraDdl: Array<{ type: string; position: number; text: string }>
  warnings: string[]
}

export interface DatabaseImportResult {
  title: string
  canvas: JsonCanvas
  warnings: string[]
}

const TYPE_ALIASES: Record<string, string> = {
  int2: 'smallint',
  int4: 'integer',
  int8: 'bigint',
  bool: 'boolean',
  float4: 'real',
  float8: 'double precision',
  varchar: 'character varying',
  bpchar: 'character',
  timestamptz: 'timestamp with time zone',
  timestamp: 'timestamp without time zone',
  timetz: 'time with time zone',
  time: 'time without time zone',
  serial: 'integer',
  serial4: 'integer',
  bigserial: 'bigint',
  serial8: 'bigint',
}

const SERIAL_TYPES = new Set(['serial', 'serial4', 'bigserial', 'serial8'])

const ACTION: Record<string, ForeignKeyAction> = {
  a: 'no_action',
  r: 'restrict',
  c: 'cascade',
  n: 'set_null',
  d: 'set_default',
}

const SUPPORTED_ALTER = new Set(['AT_AddConstraint', 'AT_AddIdentity', 'AT_ColumnDefault'])

const decoder = new TextDecoder()

function str(node: any): string | undefined {
  return node?.String?.sval
}

function nameList(nodes: any[] | undefined): string[] {
  return (nodes ?? []).map((node) => str(node)).filter((name): name is string => name !== undefined)
}

function qualified(parts: string[]): { schema: string; name: string } {
  if (parts.length >= 2) {
    return { schema: parts.slice(0, -1).join('.'), name: parts[parts.length - 1]! }
  }
  return { schema: 'public', name: parts[0] ?? '' }
}

function relationKey(relation: any): string {
  const q = qualified([relation?.schemaname, relation?.relname].filter(Boolean))
  return `${q.schema}\u0000${q.name}`
}

function sequenceKey(node: any): string {
  return relationKey(node?.sequence)
}

function typeToString(typeName: any): string {
  const raw = nameList(typeName?.names)
  const isCatalog = raw[0] === 'pg_catalog'
  const baseRaw = isCatalog ? raw[raw.length - 1]! : raw.join('.')
  const base = TYPE_ALIASES[baseRaw] ?? baseRaw
  const args: string[] = (typeName?.typmods ?? []).map((node: any) => {
    if (node?.A_Const?.ival !== undefined) return String(node.A_Const.ival.ival ?? node.A_Const.ival)
    if (node?.A_Const?.sval !== undefined) return `'${node.A_Const.sval.sval}'`
    return '?'
  })
  let out = base
  if (args.length) {
    if (base.startsWith('timestamp') || base.startsWith('time')) {
      const match = /^(timestamp|time)(?: with(out)? time zone)?$/.exec(base)
      if (match) {
        const zone = base.endsWith('with time zone')
          ? ' with time zone'
          : base.endsWith('without time zone')
            ? ' without time zone'
            : ''
        out = `${match[1]}(${args.join(',')})${zone}`
      } else {
        out = `${base}(${args.join(',')})`
      }
    } else {
      out = `${base}(${args.join(',')})`
    }
  }
  out += '[]'.repeat(typeName?.arrayBounds?.length ?? 0)
  return out
}

function hasSerialType(typeName: any): boolean {
  const raw = nameList(typeName?.names)
  return raw.some((name) => SERIAL_TYPES.has(name))
}

function nextvalArgument(node: any): { sequence: string } | undefined {
  if (!node || typeof node !== 'object') return undefined
  if (node.FuncCall) {
    const names = nameList(node.FuncCall.funcname)
    if (names[names.length - 1] !== 'nextval') return undefined
    for (const arg of node.FuncCall.args ?? []) {
      const cast = arg?.TypeCast
      const value = cast?.arg?.A_Const?.sval?.sval
      if (typeof value === 'string') return { sequence: value }
    }
  }
  return undefined
}

function ownedSequenceTarget(options: any[] | undefined): { schema: string; table: string; column: string } | undefined {
  for (const option of options ?? []) {
    const def = option?.DefElem
    if (def?.defname !== 'owned_by') continue
    const parts = nameList(def.arg?.List?.items)
    if (parts.length < 3) continue
    const column = parts[parts.length - 1]!
    const table = parts[parts.length - 2]!
    const schema = parts.slice(0, -2).join('.') || 'public'
    return { schema, table, column }
  }
  return undefined
}

function constraintLabel(table: DatabaseTableSummary, constraint: any): string {
  const name = constraint.conname ? ` ${constraint.conname}` : ''
  return `${table.schema}.${table.name}${name}`
}

export function extractDatabaseSchema(
  parsed: ParseResult,
  sql: string,
  deparse?: (node: unknown) => string | undefined,
): DatabaseSchemaSummary {
  const bytes = new TextEncoder().encode(sql)
  const statements = parsed.stmts ?? []
  const tables = new Map<string, DatabaseTableSummary>()
  const enums = new Map<string, DatabaseEnumSummary>()
  const schemas = new Map<string, { name: string; comment?: string }>()
  const extensions: Array<{ name: string; schema?: string }> = []
  const extraDdl: DatabaseSchemaSummary['extraDdl'] = []
  const warnings: string[] = []
  const consumed = new Set<number>()

  const deparseExpr = (node: any): string | undefined => {
    if (!node) return undefined
    try {
      return deparse?.(node)
    } catch {
      return undefined
    }
  }

  const rawText = (stmtIndex: number): { location: number; text: string } => {
    const raw = statements[stmtIndex]!
    const location = raw.stmt_location ?? 0
    let len = raw.stmt_len ?? 0
    if (!len) {
      const next = statements[stmtIndex + 1]
      len = (next?.stmt_location ?? bytes.length) - location
    }
    const text = decoder.decode(bytes.subarray(location, location + len)).trim()
    return { location, text: text.endsWith(';') ? text : `${text};` }
  }

  const table = (schema: string, name: string): DatabaseTableSummary => {
    const key = `${schema}\u0000${name}`
    let current = tables.get(key)
    if (!current) {
      current = { schema, name, columns: [], uniques: [], checks: [], foreignKeys: [], indexes: [] }
      tables.set(key, current)
    }
    return current
  }

  const column = (current: DatabaseTableSummary, name: string): DatabaseColumnSummary | undefined =>
    current.columns.find((candidate) => candidate.name === name)

  const serialSequences = new Set<string>()
  const serialColumns = new Map<string, string>()
  const ownedBy = new Map<string, { schema: string; table: string; column: string }>()
  const sequenceDefaults = new Map<string, string>()

  for (const raw of statements) {
    const stmt: any = raw.stmt ?? {}
    const type = Object.keys(stmt)[0] ?? 'Unknown'
    const node = stmt[type]
    if (type === 'AlterSeqStmt') {
      const target = ownedSequenceTarget(node?.options)
      if (target) ownedBy.set(sequenceKey(node), target)
    }
    if (type === 'AlterTableStmt') {
      const cmds: any[] = (node.cmds ?? []).map((cmd: any) => cmd.AlterTableCmd).filter(Boolean)
      for (const cmd of cmds) {
        if (cmd.subtype !== 'AT_ColumnDefault') continue
        const nextval = nextvalArgument(cmd.def?.raw_expr ?? cmd.def)
        if (!nextval || !cmd.name) continue
        sequenceDefaults.set(`${relationKey(node.relation)}\u0000${cmd.name}`, nextval.sequence)
      }
    }
  }

  for (const [sequence, target] of ownedBy) {
    const defaultSequence = sequenceDefaults.get(`${target.schema}\u0000${target.table}\u0000${target.column}`)
    if (!defaultSequence) continue
    const q = qualified(defaultSequence.split('.'))
    const sequenceName = `${q.schema}\u0000${q.name}`
    if (sequenceName !== sequence) continue
    serialSequences.add(sequence)
    serialColumns.set(`${target.schema}\u0000${target.table}\u0000${target.column}`, 'by_default')
  }

  const addConstraint = (current: DatabaseTableSummary, constraint: any, inlineColumn?: string) => {
    const name: string | undefined = constraint.conname
    switch (constraint.contype) {
      case 'CONSTR_PRIMARY':
        current.primaryKey = {
          ...(name ? { name } : {}),
          columns: nameList(constraint.keys).length
            ? nameList(constraint.keys)
            : inlineColumn
              ? [inlineColumn]
              : [],
        }
        if (!current.primaryKey.columns.length) delete current.primaryKey
        break
      case 'CONSTR_UNIQUE': {
        const columns = nameList(constraint.keys).length
          ? nameList(constraint.keys)
          : inlineColumn
            ? [inlineColumn]
            : []
        if (columns.length) current.uniques.push({ ...(name ? { name } : {}), columns })
        break
      }
      case 'CONSTR_CHECK': {
        const expression = deparseExpr(constraint.raw_expr)
        if (expression !== undefined) {
          current.checks.push({ ...(name ? { name } : {}), expression })
        }
        if (constraint.skip_validation) warnings.push(`Dropped NOT VALID for check ${constraintLabel(current, constraint)}.`)
        break
      }
      case 'CONSTR_FOREIGN': {
        const columns = nameList(constraint.fk_attrs).length
          ? nameList(constraint.fk_attrs)
          : inlineColumn
            ? [inlineColumn]
            : []
        const references = qualified([
          constraint.pktable?.schemaname,
          constraint.pktable?.relname,
        ].filter(Boolean))
        const foreignKey: DatabaseForeignKeySummary = {
          ...(name ? { name } : {}),
          columns,
          references: {
            schema: references.schema,
            table: references.name,
            columns: nameList(constraint.pk_attrs),
          },
        }
        const onDelete = ACTION[constraint.fk_del_action]
        const onUpdate = ACTION[constraint.fk_upd_action]
        if (onDelete && onDelete !== 'no_action') foreignKey.onDelete = onDelete
        if (onUpdate && onUpdate !== 'no_action') foreignKey.onUpdate = onUpdate
        current.foreignKeys.push(foreignKey)
        if (constraint.deferrable || constraint.initdeferred) {
          warnings.push(`Dropped FK deferrability for ${constraintLabel(current, constraint)}.`)
        }
        if (constraint.skip_validation) warnings.push(`Dropped NOT VALID for ${constraintLabel(current, constraint)}.`)
        break
      }
      default:
        break
    }
  }

  const applyColumnConstraint = (current: DatabaseTableSummary, colName: string, constraint: any) => {
    const col = column(current, colName)
    if (!col) return
    switch (constraint.contype) {
      case 'CONSTR_NOTNULL':
        col.nullable = false
        break
      case 'CONSTR_DEFAULT':
        col.default = deparseExpr(constraint.raw_expr)
        break
      case 'CONSTR_IDENTITY':
        col.identity = constraint.generated_when === 'a' ? 'always' : 'by_default'
        if ((constraint.options ?? []).length > 0) {
          warnings.push(`Dropped identity sequence options for ${current.schema}.${current.name}.${colName}.`)
        }
        break
      case 'CONSTR_GENERATED':
        col.generated = deparseExpr(constraint.raw_expr)
        break
      case 'CONSTR_PRIMARY':
      case 'CONSTR_UNIQUE':
      case 'CONSTR_CHECK':
      case 'CONSTR_FOREIGN':
        addConstraint(current, constraint, colName)
        break
      default:
        break
    }
  }

  for (const [index, raw] of statements.entries()) {
    const stmt: any = raw.stmt ?? {}
    const type = Object.keys(stmt)[0] ?? 'Unknown'
    const node = stmt[type]
    let modeled = true

    if (serialSequences.has(sequenceKey(node))) {
      consumed.add(index)
      continue
    }

    switch (type) {
      case 'CreateSchemaStmt':
        schemas.set(node.schemaname, { name: node.schemaname })
        break
      case 'CreateEnumStmt': {
        const q = qualified(nameList(node.typeName))
        enums.set(`${q.schema}\u0000${q.name}`, {
          schema: q.schema,
          name: q.name,
          values: (node.vals ?? [])
            .map((value: any) => str(value))
            .filter((value: string | undefined): value is string => value !== undefined),
        })
        break
      }
      case 'CreateStmt': {
        const relation = qualified([node.relation?.schemaname, node.relation?.relname].filter(Boolean))
        const current = table(relation.schema, relation.name)
        for (const element of node.tableElts ?? []) {
          if (element.ColumnDef) {
            const definition = element.ColumnDef
            const normalized = serialColumns.get(
              `${relation.schema}\u0000${relation.name}\u0000${definition.colname}`,
            )
            const col: DatabaseColumnSummary = {
              name: definition.colname,
              type: typeToString(definition.typeName),
              nullable: true,
            }
            if (normalized) col.identity = 'by_default'
            if (hasSerialType(definition.typeName)) col.identity = 'by_default'
            current.columns.push(col)
            for (const constraint of definition.constraints ?? []) {
              if (constraint.Constraint) applyColumnConstraint(current, definition.colname, constraint.Constraint)
            }
          } else if (element.Constraint) {
            addConstraint(current, element.Constraint)
          }
        }
        break
      }
      case 'AlterTableStmt': {
        const isNormalizedSequence = serialSequences.has(relationKey(node.relation))
        const cmds: any[] = (node.cmds ?? []).map((cmd: any) => cmd.AlterTableCmd).filter(Boolean)
        if (isNormalizedSequence) {
          consumed.add(index)
          break
        }
        if (!cmds.every((cmd) => SUPPORTED_ALTER.has(cmd.subtype))) {
          modeled = false
          break
        }
        const relation = qualified([node.relation?.schemaname, node.relation?.relname].filter(Boolean))
        const current = table(relation.schema, relation.name)
        for (const cmd of cmds) {
          if (cmd.subtype === 'AT_AddConstraint' && cmd.def?.Constraint) {
            addConstraint(current, cmd.def.Constraint)
          } else if (cmd.subtype === 'AT_AddIdentity' && cmd.def?.Constraint) {
            const col = column(current, cmd.name)
            if (col) {
              col.identity = cmd.def.Constraint.generated_when === 'a' ? 'always' : 'by_default'
              if ((cmd.def.Constraint.options ?? []).length > 0) {
                warnings.push(`Dropped identity sequence options for ${current.schema}.${current.name}.${cmd.name}.`)
              }
            }
          } else if (cmd.subtype === 'AT_ColumnDefault') {
            const col = column(current, cmd.name)
            if (!col) continue
            const nextval = nextvalArgument(cmd.def?.raw_expr ?? cmd.def)
            const normalized = serialColumns.get(
              `${relation.schema}\u0000${relation.name}\u0000${cmd.name}`,
            )
            if (nextval && normalized) {
              col.identity = 'by_default'
              delete col.default
              continue
            }
            const expression = deparseExpr(cmd.def?.raw_expr ?? cmd.def)
            if (expression === undefined) delete col.default
            else col.default = expression
          }
        }
        break
      }
      case 'IndexStmt': {
        const relation = qualified([node.relation?.schemaname, node.relation?.relname].filter(Boolean))
        const current = table(relation.schema, relation.name)
        current.indexes.push({
          name: node.idxname,
          unique: Boolean(node.unique),
          method: node.accessMethod ?? 'btree',
          columns: (node.indexParams ?? []).map((parameter: any) => {
            const element = parameter.IndexElem ?? {}
            if (element.name) return element.name
            const expression = deparseExpr(element.expr)
            return expression === undefined ? '?' : `(${expression})`
          }),
          ...(node.whereClause ? { where: deparseExpr(node.whereClause) } : {}),
        })
        break
      }
      case 'CommentStmt': {
        const object = node.object
        if (node.objtype === 'OBJECT_SCHEMA' && object?.String) {
          const current: { name: string; comment?: string } = schemas.get(object.String.sval) ?? { name: object.String.sval }
          current.comment = node.comment
          schemas.set(current.name, current)
        } else if (node.objtype === 'OBJECT_TABLE' && object?.List) {
          const q = qualified(nameList(object.List.items))
          table(q.schema, q.name).comment = node.comment
        } else if (node.objtype === 'OBJECT_COLUMN' && object?.List) {
          const parts = nameList(object.List.items)
          const colName = parts.pop()
          const q = qualified(parts)
          const col = column(table(q.schema, q.name), colName ?? '')
          if (col) col.comment = node.comment
        } else if (node.objtype === 'OBJECT_TYPE' && object?.TypeName) {
          const q = qualified(nameList(object.TypeName.names))
          const current = enums.get(`${q.schema}\u0000${q.name}`)
          if (current) current.comment = node.comment
          else modeled = false
        } else {
          modeled = false
        }
        break
      }
      case 'CreateExtensionStmt': {
        const schemaOption = (node.options ?? []).find((option: any) => option.DefElem?.defname === 'schema')
        extensions.push({
          name: node.extname,
          ...(schemaOption?.DefElem?.arg?.String ? { schema: schemaOption.DefElem.arg.String.sval } : {}),
        })
        break
      }
      case 'CreateSeqStmt':
      case 'AlterSeqStmt':
        modeled = false
        break
      default:
        modeled = false
    }

    if (!modeled && !consumed.has(index)) {
      const rawSource = rawText(index)
      extraDdl.push({ type, position: rawSource.location, text: rawSource.text })
    }
  }

  const databaseVersion = /Dumped from database version ([0-9][0-9.]*)/.exec(sql)?.[1]
  if (!serialSequences.size) {
    // No warning needed when the input has no serial patterns.
  } else {
    warnings.push(
      `Normalised ${serialSequences.size} serial sequence${serialSequences.size === 1 ? '' : 's'} to identity.`,
    )
  }
  if (extraDdl.length > 0) {
    warnings.push(`Kept ${extraDdl.length} unmodelled statement${extraDdl.length === 1 ? '' : 's'} in Extra DDL.`)
  }

  return {
    ...(databaseVersion ? { databaseVersion } : {}),
    schemas: [...schemas.values()].sort((a, b) => a.name.localeCompare(b.name)),
    enums: [...enums.values()].sort((a, b) =>
      `${a.schema}.${a.name}`.localeCompare(`${b.schema}.${b.name}`)),
    tables: [...tables.values()].sort((a, b) =>
      `${a.schema}.${a.name}`.localeCompare(`${b.schema}.${b.name}`)),
    extensions,
    extraDdl,
    warnings,
  }
}

function makeNode(entityType: string, fields: EntityFields): CanvasNode {
  const definition = findEntityType(DEFAULT_ONTOLOGY, entityType)
  return {
    id: createNodeId(),
    type: 'text',
    x: 0,
    y: 0,
    width: definition?.defaultSize.width ?? 360,
    height: definition?.defaultSize.height ?? 240,
    text: '',
    app: { entityType, fields },
  }
}

function extraText(summary: DatabaseSchemaSummary): string {
  return summary.extraDdl.map((statement) => statement.text).join('\n\n')
}

function tableDefinition(summary: DatabaseTableSummary): TableDefinition {
  return {
    columns: summary.columns.map((col) => ({ ...col })),
    ...(summary.primaryKey ? { primaryKey: summary.primaryKey } : {}),
    uniques: summary.uniques,
    checks: summary.checks,
    foreignKeys: summary.foreignKeys,
    indexes: summary.indexes,
  }
}

export function importDatabaseSchema(
  summary: DatabaseSchemaSummary,
  title = 'Imported database',
): DatabaseImportResult {
  const usedSchemas = new Set<string>()
  for (const table of summary.tables) usedSchemas.add(table.schema)
  for (const item of summary.enums) usedSchemas.add(item.schema)
  for (const schema of summary.schemas) usedSchemas.add(schema.name)
  if (usedSchemas.size === 0) usedSchemas.add('public')

  const schemaNodes = new Map<string, CanvasNode>()
  const nodes: CanvasNode[] = []
  for (const name of [...usedSchemas].sort((a, b) => a.localeCompare(b))) {
    const schema = summary.schemas.find((candidate) => candidate.name === name)
    const node = makeNode('db_schema', {
      name,
      description: schema?.comment ?? '',
    })
    schemaNodes.set(name, node)
    nodes.push(node)
  }

  for (const item of summary.enums) {
    const node = makeNode('db_enum', {
      name: item.name,
      schema: item.schema,
      values: item.values.join('\n'),
      description: item.comment ?? '',
    })
    nodes.push(node)
  }

  for (const table of summary.tables) {
    const node = makeNode('table', {
      name: table.name,
      schema: table.schema,
      description: table.comment ?? '',
      status: 'active',
      definition: stringifyTableDefinition(tableDefinition(table)),
    })
    nodes.push(node)
  }

  const database = makeNode('database_definition', {
    name: title,
    version: summary.databaseVersion ?? '',
    description: '',
    owner: '',
    extensions: summary.extensions
      .map((extension) => extension.schema ? `${extension.name} ${extension.schema}` : extension.name)
      .join('\n'),
    extra: extraText(summary),
  })
  nodes.push(database)

  const canvas: JsonCanvas = {
    nodes,
    edges: [],
    app: profileMetadata(DATABASE_PROFILE),
  }
  const withReferences = withManagedReferences(canvas)
  const laidOut = layoutDatabaseCanvas(withReferences, estimateDatabaseSizes(withReferences))
  return {
    title,
    canvas: laidOut,
    warnings: summary.warnings,
  }
}

export async function importDatabaseParsed(
  parsed: ParseResult,
  sql: string,
  parser?: Pick<DatabaseParser, 'deparse'>,
): Promise<DatabaseImportResult> {
  return importDatabaseSchema(extractDatabaseSchema(parsed, sql, parser?.deparse))
}

export async function importDatabaseSql(
  sql: string,
  options: { wasm?: ArrayBuffer | ArrayBufferView } = {},
): Promise<DatabaseImportResult> {
  const parser = await loadDatabaseParser(options.wasm)
  return importDatabaseParsed(await parser.parse(sql), sql, parser)
}
