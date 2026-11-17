import { isObject, objectOrEmpty, schemaNameFromRef } from '../openapi/document'
import type { JsonObject } from '../openapi/types'

export type FieldKind = 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'enum' | 'ref' | 'advanced'

export interface FieldDetails {
  format: string
  minLength: string
  maxLength: string
  pattern: string
  minimum: string
  maximum: string
  default: string
  itemsType: string
}

export interface FieldRow {
  path: string[]
  name: string
  kind: FieldKind
  required: boolean
  nullable: boolean
  description: string
  enumValues: string[]
  ref: string
  baseType: string
  details: FieldDetails
  advanced: boolean
  children: FieldRow[]
}

export interface FieldModel {
  valid: boolean
  error: string
  rootKind: FieldKind
  rootAdvanced: boolean
  rows: FieldRow[]
}

export interface SchemaColumn {
  key: string
  path: string[]
  label: string
  required: boolean
  kind: FieldKind
  nullable: boolean
  enumValues: string[]
  format: string
  compact: boolean
}

export type FieldEdit =
  | { type: 'add'; parentPath: string[]; name?: string }
  | { type: 'delete'; path: string[] }
  | { type: 'rename'; path: string[]; name: string }
  | { type: 'move'; path: string[]; direction: -1 | 1 }
  | { type: 'setType'; path: string[]; kind: FieldKind; itemsType?: string }
  | { type: 'setRequired'; path: string[]; required: boolean }
  | { type: 'setNullable'; path: string[]; nullable: boolean }
  | { type: 'setDescription'; path: string[]; description: string }
  | { type: 'setDetails'; path: string[]; details: Record<string, string | number | undefined> }
  | { type: 'setEnum'; path: string[]; values: string[] }
  | { type: 'setRef'; path: string[]; name: string }

const ADVANCED_KEYS = ['oneOf', 'anyOf', 'allOf', 'not', 'if', 'patternProperties', '$defs'] as const
const OWNED_KEYS = [
  'type', 'enum', '$ref', 'properties', 'items', 'format', 'minLength', 'maxLength',
  'pattern', 'minimum', 'maximum', 'required',
] as const

const DETAIL_KEYS = [
  'format', 'minLength', 'maxLength', 'pattern', 'minimum', 'maximum', 'default',
] as const

const TYPE_KEYWORDS = [
  'enum', '$ref', 'properties', 'items', 'format', 'minLength', 'maxLength', 'pattern',
  'minimum', 'maximum', 'required', 'default',
] as const

const STRING_KEYWORDS = ['format', 'minLength', 'maxLength', 'pattern'] as const
const NUMBER_KEYWORDS = ['minimum', 'maximum'] as const

export interface FieldEditResult {
  source: string
  error?: string
}

function string(value: unknown): string {
  return value == null ? '' : String(value)
}

function typeBase(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).find((item) => item !== 'null') ?? ''
  return typeof value === 'string' ? value : ''
}

function isNullable(value: unknown): boolean {
  return Array.isArray(value) && value.map(String).includes('null')
}

function isAdvanced(schema: JsonObject): boolean {
  return ADVANCED_KEYS.some((key) => key in schema)
}

function detailsFor(schema: JsonObject): FieldDetails {
  return {
    format: string(schema.format),
    minLength: string(schema.minLength),
    maxLength: string(schema.maxLength),
    pattern: string(schema.pattern),
    minimum: string(schema.minimum),
    maximum: string(schema.maximum),
    default: 'default' in schema ? JSON.stringify(schema.default) : '',
    itemsType: typeBase(objectOrEmpty(schema.items).type) || (objectOrEmpty(schema.items).properties ? 'object' : 'string'),
  }
}

function kindFor(schema: JsonObject): FieldKind {
  if (isAdvanced(schema)) return 'advanced'
  if (typeof schema.$ref === 'string') return 'ref'
  if (Array.isArray(schema.enum)) return 'enum'
  const base = typeBase(schema.type)
  if (base === 'object' || (!base && isObject(schema.properties))) return 'object'
  if (base === 'array' || (!base && schema.items)) return 'array'
  if (base === 'string' || base === 'number' || base === 'integer' || base === 'boolean') return base
  return 'advanced'
}

function parseRow(name: string, schema: unknown, required: boolean, path: string[], depth = 0): FieldRow {
  const value = objectOrEmpty(schema)
  const kind = kindFor(value)
  const nullable = isNullable(value.type)
  const children = kind === 'object' && depth < 8
    ? Object.entries(objectOrEmpty(value.properties)).map(([childName, child]) => (
      parseRow(childName, child, Array.isArray(value.required) && value.required.map(String).includes(childName), [...path, childName], depth + 1)
    ))
    : []
  return {
    path,
    name,
    kind,
    required,
    nullable,
    description: string(value.description),
    enumValues: Array.isArray(value.enum) ? value.enum.map(String) : [],
    ref: schemaNameFromRef(value.$ref) ?? '',
    baseType: typeBase(value.type),
    details: detailsFor(value),
    advanced: kind === 'advanced',
    children,
  }
}

export function parseFieldModel(source: string): FieldModel {
  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch (cause) {
    return {
      valid: false,
      error: cause instanceof Error ? cause.message : 'Invalid JSON.',
      rootKind: 'advanced',
      rootAdvanced: true,
      rows: [],
    }
  }
  if (typeof parsed === 'boolean') {
    return { valid: true, error: '', rootKind: 'advanced', rootAdvanced: true, rows: [] }
  }
  if (!isObject(parsed)) {
    return { valid: false, error: 'A JSON Schema must be an object or boolean.', rootKind: 'advanced', rootAdvanced: true, rows: [] }
  }
  const rootKind = kindFor(parsed)
  const required = new Set(Array.isArray(parsed.required) ? parsed.required.map(String) : [])
  return {
    valid: true,
    error: '',
    rootKind,
    rootAdvanced: rootKind === 'advanced',
    rows: Object.entries(objectOrEmpty(parsed.properties)).map(([name, schema]) => (
      parseRow(name, schema, required.has(name), [name])
    )),
  }
}

export function buildSchemaColumns(model: FieldModel): SchemaColumn[] {
  if (!model.valid) return []
  if (model.rootKind !== 'object' && model.rows.length === 0) {
    return [{
      key: 'value',
      path: [],
      label: 'value',
      required: false,
      kind: model.rootKind,
      nullable: false,
      enumValues: [],
      format: '',
      compact: model.rootKind === 'array' || model.rootKind === 'advanced',
    }]
  }
  const columns: SchemaColumn[] = []
  for (const row of model.rows) {
    if (row.kind === 'object' && row.children.length > 0) {
      for (const child of row.children) {
        columns.push({
          key: `${row.name}.${child.name}`,
          path: [...row.path, child.name],
          label: `${row.name}.${child.name}`,
          required: child.required,
          kind: child.kind,
          nullable: child.nullable,
          enumValues: child.enumValues,
          format: child.details.format,
          compact: child.kind === 'object' || child.kind === 'array' || child.kind === 'ref' || child.kind === 'advanced',
        })
      }
    } else {
      columns.push({
        key: row.name,
        path: row.path,
        label: row.name,
        required: row.required,
        kind: row.kind,
        nullable: row.nullable,
        enumValues: row.enumValues,
        format: row.details.format,
        compact: row.kind === 'object' || row.kind === 'array' || row.kind === 'ref' || row.kind === 'advanced',
      })
    }
  }
  return columns
}

function schemaAt(root: JsonObject, path: string[]): JsonObject | undefined {
  let current: JsonObject | undefined = root
  for (const name of path) {
    current = objectOrEmpty(objectOrEmpty(current.properties)[name])
    if (!isObject(current)) return undefined
  }
  return current
}

function parentAt(root: JsonObject, path: string[]): JsonObject {
  return path.length <= 1 ? root : schemaAt(root, path.slice(0, -1)) ?? root
}

function uniqueName(properties: JsonObject, base = 'field'): string {
  if (!(base in properties)) return base
  let index = 2
  while (`${base}_${index}` in properties) index += 1
  return `${base}_${index}`
}

function typeValue(base: string, nullable: boolean): string | string[] {
  return nullable ? [base, 'null'] : base
}

function keywordsForType(kind: FieldKind): Set<string> {
  if (kind === 'string') return new Set([...STRING_KEYWORDS, 'default'])
  if (kind === 'number' || kind === 'integer') return new Set([...NUMBER_KEYWORDS, 'default'])
  if (kind === 'boolean') return new Set(['default'])
  if (kind === 'object') return new Set(['properties', 'required', 'default'])
  if (kind === 'array') return new Set(['items', 'default'])
  if (kind === 'enum') return new Set([...STRING_KEYWORDS, 'enum', 'default'])
  return new Set()
}

function defaultMatches(value: unknown, kind: FieldKind, schema: JsonObject, nullable: boolean): boolean {
  if (value === null) return nullable
  if (kind === 'string') return typeof value === 'string'
  if (kind === 'number') return typeof value === 'number'
  if (kind === 'integer') return typeof value === 'number' && Number.isInteger(value)
  if (kind === 'boolean') return typeof value === 'boolean'
  if (kind === 'object') return isObject(value)
  if (kind === 'array') return Array.isArray(value)
  if (kind === 'enum') {
    return Array.isArray(schema.enum)
      && schema.enum.some((item) => JSON.stringify(item) === JSON.stringify(value))
  }
  return false
}

function setOwnedType(schema: JsonObject, kind: FieldKind, nullable: boolean, itemsType = 'string'): void {
  if (kind === 'ref' || kind === 'advanced') return
  const allowed = keywordsForType(kind)
  for (const key of TYPE_KEYWORDS) {
    if (key !== 'default' && !allowed.has(key) && key in schema) delete schema[key]
  }
  if (kind === 'enum') {
    const base = typeBase(schema.type)
    const enumBase = ['string', 'number', 'integer', 'boolean'].includes(base) ? base : 'string'
    schema.type = typeValue(enumBase, nullable)
    if (!Array.isArray(schema.enum)) schema.enum = []
  } else if (kind === 'object') {
    if (!isObject(schema.properties)) schema.properties = {}
    schema.type = typeValue('object', nullable)
  } else if (kind === 'array') {
    const items = objectOrEmpty(schema.items)
    const itemKind = itemsType || typeBase(items.type) || 'string'
    const nextItems: JsonObject = { ...items, type: itemKind }
    if (itemKind !== 'object') delete nextItems.properties
    schema.items = nextItems
    schema.type = typeValue('array', nullable)
  } else {
    schema.type = typeValue(kind, nullable)
  }
  if ('default' in schema && !defaultMatches(schema.default, kind, schema, nullable)) {
    delete schema.default
  }
}

function exampleParent(record: JsonObject, path: string[]): JsonObject | undefined {
  let current: JsonObject = record
  for (const segment of path) {
    const next = current[segment]
    if (!isObject(next)) return undefined
    current = next
  }
  return current
}

function renameExampleKey(record: JsonObject, parentPath: string[], previous: string, name: string): void {
  const parent = exampleParent(record, parentPath)
  if (!parent || !(previous in parent)) return
  const entries = Object.entries(parent).map(([key, value]) => [key === previous ? name : key, value] as const)
  for (const key of Object.keys(parent)) delete parent[key]
  for (const [key, value] of entries) parent[key] = value
}

function deleteExampleKey(record: JsonObject, parentPath: string[], name: string): void {
  const parent = exampleParent(record, parentPath)
  if (parent) delete parent[name]
}

function updateExamples(root: JsonObject, path: string[], update: (record: JsonObject, parentPath: string[], name: string) => void): void {
  if (!Array.isArray(root.examples) || path.length === 0) return
  const parentPath = path.slice(0, -1)
  const name = path.at(-1)!
  for (const example of root.examples) {
    if (isObject(example)) update(example, parentPath, name)
  }
}

export function applyFieldEditResult(source: string, edit: FieldEdit): FieldEditResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch {
    return { source }
  }
  if (!isObject(parsed)) return { source }
  const root = structuredClone(parsed)
  if (edit.type === 'add') {
    const parent = schemaAt(root, edit.parentPath)
    if (!parent) return { source }
    if (!isObject(parent.properties)) parent.properties = {}
    const properties = parent.properties as JsonObject
    const name = uniqueName(properties, edit.name)
    properties[name] = { type: 'string' }
  } else if (edit.type === 'delete') {
    if (edit.path.length === 0) return { source }
    const parent = parentAt(root, edit.path)
    const name = edit.path.at(-1)!
    delete objectOrEmpty(parent.properties)[name]
    if (Array.isArray(parent.required)) {
      const remaining = parent.required.filter((item) => String(item) !== name)
      if (remaining.length === 0) delete parent.required
      else parent.required = remaining
    }
    updateExamples(root, edit.path, deleteExampleKey)
  } else if (edit.type === 'rename') {
    const name = edit.name.trim()
    if (!name || edit.path.length === 0) return { source }
    const parent = parentAt(root, edit.path)
    const previous = edit.path.at(-1)!
    if (previous === name) return { source }
    const properties = objectOrEmpty(parent.properties)
    if (name in properties) {
      return {
        source,
        error: `"${name}" already exists in this object.`,
      }
    }
    const entries = Object.entries(properties)
    parent.properties = Object.fromEntries(entries.map(([key, value]) => [key === previous ? name : key, value]))
    if (Array.isArray(parent.required)) {
      parent.required = parent.required.map((item) => String(item) === previous ? name : item)
    }
    updateExamples(root, edit.path, (record, parentPath, current) => {
      renameExampleKey(record, parentPath, current, name)
    })
  } else if (edit.type === 'move') {
    if (edit.path.length === 0) return { source }
    const parent = parentAt(root, edit.path)
    const properties = objectOrEmpty(parent.properties)
    const entries = Object.entries(properties)
    const index = entries.findIndex(([key]) => key === edit.path.at(-1))
    const nextIndex = index + edit.direction
    if (index < 0 || nextIndex < 0 || nextIndex >= entries.length) return { source }
    const copy = [...entries]
    const [item] = copy.splice(index, 1)
    if (!item) return { source }
    copy.splice(nextIndex, 0, item)
    parent.properties = Object.fromEntries(copy)
  } else {
    const schema = schemaAt(root, edit.path)
    if (!schema) return { source }
    const parent = parentAt(root, edit.path)
    const name = edit.path.at(-1)
    if (edit.type === 'setType') {
      setOwnedType(schema, edit.kind, isNullable(schema.type), edit.itemsType)
    } else if (edit.type === 'setRequired') {
      if (!name) return { source }
      const required = new Set(Array.isArray(parent.required) ? parent.required.map(String) : [])
      if (edit.required) required.add(name)
      else required.delete(name)
      if (required.size > 0) parent.required = [...required]
      else delete parent.required
    } else if (edit.type === 'setNullable') {
      const kind = kindFor(schema)
      if (kind === 'ref' || kind === 'advanced') return { source }
      const base = typeBase(schema.type)
      if (base) schema.type = typeValue(base, edit.nullable)
    } else if (edit.type === 'setDescription') {
      if (edit.description.trim()) schema.description = edit.description
      else delete schema.description
    } else if (edit.type === 'setDetails') {
      for (const key of DETAIL_KEYS) {
        if (!(key in edit.details)) continue
        const value = edit.details[key]
        if (value === undefined || value === '') {
          delete schema[key]
          continue
        }
        if (key === 'default') {
          try {
            schema.default = JSON.parse(String(value))
          } catch {
            schema.default = String(value)
          }
        } else if (['minLength', 'maxLength', 'minimum', 'maximum'].includes(key)) {
          const number = Number(value)
          if (Number.isFinite(number)) schema[key] = number
          else delete schema[key]
        } else {
          schema[key] = String(value)
        }
      }
    } else if (edit.type === 'setEnum') {
      if (edit.values.length > 0) {
        if (!typeBase(schema.type)) schema.type = 'string'
        schema.enum = edit.values
      } else {
        delete schema.enum
      }
    } else if (edit.type === 'setRef') {
      const ref = edit.name.trim()
      if (!ref) return { source }
      for (const key of OWNED_KEYS) delete schema[key]
      schema.$ref = `#/components/schemas/${ref}`
    }
  }
  return { source: JSON.stringify(root, null, 2) }
}

export function applyFieldEdit(source: string, edit: FieldEdit): string {
  return applyFieldEditResult(source, edit).source
}
