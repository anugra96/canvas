import Ajv from 'ajv'
import Ajv2020 from 'ajv/dist/2020'

import openApiSchemaJson from '../../../../packages/canvas-contract/src/openapi/fixtures/openapi-3.1-schema-2022-10-07.json'

import {
  getEntityMeta,
  type SchemaColumn,
  type CanvasEdge,
  type CanvasNode,
  type CanvasProfileIssue,
  objectOrEmpty,
} from '@canvas/contract'

export interface SchemaOutlineNode {
  name: string
  type: string
  required: boolean
  description?: string
  constraints?: string
  children: SchemaOutlineNode[]
}

interface SchemaDiagnostic {
  severity: 'error' | 'warning'
  message: string
  path?: string
}

export interface SchemaAnalysis {
  valid: boolean
  parsed: unknown
  diagnostics: SchemaDiagnostic[]
  outline: SchemaOutlineNode[]
  title?: string
  description?: string
}

const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false })
const ajv2020 = new Ajv2020({ allErrors: true, strict: false, validateFormats: true })
ajv2020.addFormat('date', (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)))
ajv2020.addFormat('date-time', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/)
ajv2020.addFormat('email', /^[^\s@]+@[^\s@]+\.[^\s@]+$/)
ajv2020.addFormat('uuid', /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
ajv2020.addFormat('uri', (value: string) => /^[a-z][a-z0-9+.-]*:/i.test(value))
ajv2020.addFormat('uri-reference', () => true)
ajv2020.addFormat('media-range', () => true)
function patchOpenApiDynamicMeta(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(patchOpenApiDynamicMeta)
  if (!value || typeof value !== 'object') return value
  const result: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    if (key === '$dynamicRef' && child === '#meta') result.$ref = '#/$defs/schema'
    else result[key] = patchOpenApiDynamicMeta(child)
  }
  return result
}

const validateOpenApiDocument = ajv2020.compile(patchOpenApiDynamicMeta(openApiSchemaJson) as object)

function stringField(value: unknown): string {
  return value == null ? '' : String(value)
}

function typeLabel(schema: Record<string, unknown>): string {
  const type = schema.type
  if (Array.isArray(type)) return type.map(String).join(' | ')
  if (typeof type === 'string') return type
  if (typeof schema.$ref === 'string') return schema.$ref
  if (schema.properties && typeof schema.properties === 'object') return 'object'
  if (schema.items) return 'array'
  if (schema.oneOf) return 'oneOf'
  if (schema.anyOf) return 'anyOf'
  if (schema.allOf) return 'allOf'
  if (schema.enum) return 'enum'
  if (schema.const !== undefined) return 'const'
  return 'any'
}

function constraintsLabel(value: Record<string, unknown>): string | undefined {
  const parts: string[] = []
  if (typeof value.format === 'string') parts.push(`format ${value.format}`)
  if (value.minimum !== undefined) parts.push(`min ${String(value.minimum)}`)
  if (value.maximum !== undefined) parts.push(`max ${String(value.maximum)}`)
  if (value.minLength !== undefined) parts.push(`min length ${String(value.minLength)}`)
  if (value.maxLength !== undefined) parts.push(`max length ${String(value.maxLength)}`)
  if (value.pattern !== undefined) parts.push(`pattern ${String(value.pattern)}`)
  if (Array.isArray(value.enum)) parts.push(`enum ${value.enum.map(String).join(' | ')}`)
  if (value.additionalProperties === false) parts.push('closed object')
  return parts.length > 0 ? parts.join(' · ') : undefined
}

function buildOutline(
  schema: unknown,
  name: string,
  required: boolean,
  depth = 0,
): SchemaOutlineNode {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema) || depth > 8) {
    return { name, type: 'any', required, children: [] }
  }
  const value = schema as Record<string, unknown>
  const children: SchemaOutlineNode[] = []
  const requiredKeys = new Set(Array.isArray(value.required) ? value.required.map(String) : [])
  if (value.properties && typeof value.properties === 'object' && !Array.isArray(value.properties)) {
    for (const [key, child] of Object.entries(value.properties as Record<string, unknown>)) {
      children.push(buildOutline(child, key, requiredKeys.has(key), depth + 1))
    }
  }
  if (value.items) {
    children.push(buildOutline(value.items, '[]', false, depth + 1))
  }
  for (const key of ['oneOf', 'anyOf', 'allOf'] as const) {
    const variants = value[key]
    if (Array.isArray(variants)) {
      variants.slice(0, 8).forEach((variant, index) => {
        children.push(buildOutline(variant, `${key}[${index}]`, false, depth + 1))
      })
    }
  }
  return {
    name,
    type: typeLabel(value),
    required,
    ...(typeof value.description === 'string' ? { description: value.description } : {}),
    ...(constraintsLabel(value) ? { constraints: constraintsLabel(value) } : {}),
    children: children.slice(0, 40),
  }
}

function formatSchemaError(error: { instancePath?: string; message?: string }): string {
  const path = error.instancePath ? error.instancePath.replace(/^\//, '') : 'root'
  return `${path}: ${error.message ?? 'invalid JSON Schema'}`
}

export interface SchemaAnalysisOptions {
  assumedDialect?: 'draft-07' | '2019-09' | '2020-12'
}

export function analyzeJsonSchema(source: string, options: SchemaAnalysisOptions = {}): SchemaAnalysis {
  const value = source.trim()
  if (!value) {
    return {
      valid: false,
      parsed: null,
      diagnostics: [{ severity: 'error', message: 'Schema source is empty.' }],
      outline: [],
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch (cause) {
    return {
      valid: false,
      parsed: null,
      diagnostics: [{
        severity: 'error',
        message: cause instanceof Error ? `Invalid JSON: ${cause.message}` : 'Invalid JSON.',
      }],
      outline: [],
    }
  }

  if (parsed === null || (typeof parsed !== 'object' && typeof parsed !== 'boolean')) {
    return {
      valid: false,
      parsed,
      diagnostics: [{ severity: 'error', message: 'A JSON Schema must be an object or boolean.' }],
      outline: [],
    }
  }

  const record = typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : null
  const declaredUri = record && typeof record.$schema === 'string' ? record.$schema : ''
  const schemaUri = declaredUri || (options.assumedDialect
    ? `https://json-schema.org/draft/${options.assumedDialect}/schema`
    : '')
  if (schemaUri.includes('draft-04') || schemaUri.includes('draft-06')) {
    return {
      valid: false,
      parsed,
      diagnostics: [{ severity: 'error', message: 'Only draft-07, 2019-09, and 2020-12 JSON Schema are supported.' }],
      outline: [],
    }
  }

  const validator = schemaUri.includes('2020-12') ? ajv2020 : ajv
  let valid = true
  try {
    const result = validator.validateSchema(parsed as object | boolean)
    valid = typeof result === 'boolean' ? result : false
  } catch (cause) {
    return {
      valid: false,
      parsed,
      diagnostics: [{
        severity: 'error',
        message: cause instanceof Error ? cause.message : 'Could not validate the JSON Schema dialect.',
      }],
      outline: [],
    }
  }

  const diagnostics: SchemaDiagnostic[] = []
  if (!valid) {
    for (const error of validator.errors ?? []) {
      diagnostics.push({
        severity: 'error',
        message: formatSchemaError(error),
        ...(error.instancePath ? { path: error.instancePath } : {}),
      })
    }
  }
  if (diagnostics.length === 0 && record && typeof record.$schema !== 'string' && !options.assumedDialect) {
    diagnostics.push({
      severity: 'warning',
      message: 'No $schema dialect is declared; draft-07 is assumed.',
    })
  }

  const title = record && typeof record.title === 'string' ? record.title : undefined
  const description = record && typeof record.description === 'string'
    ? record.description
    : undefined
  return {
    valid: diagnostics.every((diagnostic) => diagnostic.severity !== 'error'),
    parsed,
    diagnostics,
    outline: [buildOutline(parsed, 'root', false)],
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
  }
}

function parseDate(value: string): Date | null {
  if (!value.trim()) return null
  const date = new Date(`${value.trim()}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

export function schemaReviewReasons(fields: Record<string, unknown>, now: Date): string[] {
  const reasons: string[] = []
  const status = stringField(fields.status) || 'draft'
  if (status === 'deprecated') return reasons
  if (stringField(fields.reviewStatus) !== 'approved') reasons.push('review not approved')
  if (!stringField(fields.owner).trim()) reasons.push('no owner')
  const version = stringField(fields.version).trim()
  const reviewedVersion = stringField(fields.reviewedVersion).trim()
  if (reviewedVersion && version && reviewedVersion !== version) reasons.push('version changed since review')
  const lastReviewed = parseDate(stringField(fields.lastReviewed))
  const interval = Number(fields.reviewIntervalDays)
  if (lastReviewed && Number.isFinite(interval) && interval > 0) {
    const due = new Date(lastReviewed)
    due.setDate(due.getDate() + interval)
    if (due.getTime() < now.getTime()) reasons.push('review overdue')
  } else if (stringField(fields.reviewStatus) === 'approved' && !lastReviewed) {
    reasons.push('approved without a review date')
  }
  return reasons
}

function relationOf(edge: CanvasEdge): string {
  return stringField(edge.app?.relationType)
}

function nodeEntityType(node: CanvasNode): string {
  return getEntityMeta(node)?.entityType ?? ''
}

function surfaceKind(node: CanvasNode): string {
  const meta = getEntityMeta(node)
  if (!meta) return ''
  if (meta.entityType === 'system') {
    const kind = stringField(meta.fields.kind)
    return kind === 'api' || kind === 'database' ? kind : meta.entityType
  }
  return meta.entityType
}

function nodeName(node: CanvasNode): string {
  const meta = getEntityMeta(node)
  const fields = meta?.fields ?? {}
  return stringField(fields.name || fields.title) || `Untitled ${nodeEntityType(node) || 'card'}`
}

export function validateSchemaContracts(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  now = new Date(),
  mode: 'systems' | 'api' = 'systems',
): CanvasProfileIssue[] {
  const issues: CanvasProfileIssue[] = []
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const schemas = nodes.filter((node) => nodeEntityType(node) === 'schema')
  const schemaIds = new Set(schemas.map((node) => node.id))
  const schemasByTarget = new Map<string, CanvasNode[]>()
  const usesBySystem = new Map<string, Set<string>>()
  const linkedSchemas = new Set<string>()

  for (const edge of edges) {
    const relation = relationOf(edge)
    if (relation === 'describes' && schemaIds.has(edge.fromNode)) {
      const target = nodesById.get(edge.toNode)
      const targetType = target ? surfaceKind(target) : ''
      if (target && (targetType === 'api' || targetType === 'database')) {
        const list = schemasByTarget.get(edge.toNode) ?? []
        const schema = nodesById.get(edge.fromNode)
        if (schema) list.push(schema)
        schemasByTarget.set(edge.toNode, list)
        linkedSchemas.add(edge.fromNode)
      }
    }
    if (relation === 'uses' && schemaIds.has(edge.toNode)) {
      const set = usesBySystem.get(edge.fromNode) ?? new Set<string>()
      set.add(edge.toNode)
      usesBySystem.set(edge.fromNode, set)
      linkedSchemas.add(edge.toNode)
      if (schemaIds.has(edge.fromNode)) linkedSchemas.add(edge.fromNode)
    }
    if (relation === 'defines' && schemaIds.has(edge.toNode)) {
      linkedSchemas.add(edge.toNode)
    }
    if ((relation === 'accepts' || relation === 'returns') && schemaIds.has(edge.toNode)) {
      linkedSchemas.add(edge.toNode)
    }
  }

  for (const schema of schemas) {
    const fields = getEntityMeta(schema)?.fields ?? {}
    const name = nodeName(schema)
    const analysis = analyzeJsonSchema(
      stringField(fields.source),
      mode === 'api' ? { assumedDialect: '2020-12' } : {},
    )
    const firstError = analysis.diagnostics.find((diagnostic) => diagnostic.severity === 'error')
    if (firstError) {
      issues.push({
        code: 'schema_invalid',
        severity: 'error',
        message: `Schema "${name}" is invalid: ${firstError.message}`,
        nodeId: schema.id,
      })
    }
    const reviewReasons = schemaReviewReasons(fields, now)
    if (reviewReasons.length > 0 && mode === 'systems') {
      issues.push({
        code: 'schema_review',
        severity: 'warning',
        message: `Schema "${name}" needs review: ${reviewReasons.join(', ')}.`,
        nodeId: schema.id,
      })
    }
    if (!linkedSchemas.has(schema.id)) {
      issues.push({
        code: 'schema_unlinked',
        severity: 'warning',
        message: `Schema "${name}" is not linked to an architecture card.`,
        nodeId: schema.id,
      })
    }
    const contractTargets = [...schemasByTarget.entries()]
      .filter(([, candidates]) => candidates.some((candidate) => candidate.id === schema.id))
    for (const [targetId] of contractTargets) {
      const target = nodesById.get(targetId)
      if (!target) continue
      const targetStatus = stringField(getEntityMeta(target)?.fields.status)
      if (stringField(fields.status) === 'draft' && targetStatus === 'active') {
        issues.push({
          code: 'schema_contract',
          severity: 'warning',
          message: `Active ${surfaceKind(target)} "${nodeName(target)}" is described by draft schema "${name}".`,
          nodeId: schema.id,
        })
      }
    }
  }

  if (mode === 'api') {
    const api = nodes.find((node) => nodeEntityType(node) === 'api_definition')
    if (api) {
      const reviewReasons = schemaReviewReasons(getEntityMeta(api)?.fields ?? {}, now)
      if (reviewReasons.length > 0) {
        issues.push({
          code: 'schema_review',
          severity: 'warning',
          message: `API "${nodeName(api)}" needs review: ${reviewReasons.join(', ')}.`,
          nodeId: api.id,
        })
      }
    }
  }

  for (const node of nodes) {
    const type = surfaceKind(node)
    if (type !== 'api' && type !== 'database') continue
    if (stringField(getEntityMeta(node)?.fields.status) !== 'active') continue
    if ((schemasByTarget.get(node.id)?.length ?? 0) === 0) {
      issues.push({
        code: 'schema_contract',
        severity: 'warning',
        message: `Active ${type} "${nodeName(node)}" has no linked schema contract.`,
        nodeId: node.id,
      })
    }
  }


  return issues
}


function schemaMap(nodes: CanvasNode[]): Record<string, unknown> {
  const schemas: Record<string, unknown> = {}
  for (const node of nodes) {
    if (getEntityMeta(node)?.entityType !== 'schema') continue
    const name = stringField(getEntityMeta(node)?.fields.name)
    if (!name) continue
    try {
      schemas[name] = JSON.parse(stringField(getEntityMeta(node)?.fields.source))
    } catch {
      // Invalid schema source is reported separately.
    }
  }
  return schemas
}

function validatesExample(example: unknown, schema: unknown, schemas: Record<string, unknown>): boolean | undefined {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return undefined
  try {
    const root = {
      ...(schema as Record<string, unknown>),
      components: { ...objectOrEmpty((schema as Record<string, unknown>).components), schemas },
    }
    return ajv2020.compile(root)(example) as boolean
  } catch {
    return undefined
  }
}

function mediaIssues(
  media: Record<string, unknown>,
  schemas: Record<string, unknown>,
  label: string,
  nodeId: string,
): CanvasProfileIssue[] {
  const issues: CanvasProfileIssue[] = []
  const examples: Array<[string, unknown]> = []
  if ('example' in media) examples.push(['example', media.example])
  const named = media.examples && typeof media.examples === 'object' && !Array.isArray(media.examples)
    ? media.examples as Record<string, unknown>
    : {}
  for (const [name, entry] of Object.entries(named)) {
    if (entry && typeof entry === 'object' && !Array.isArray(entry) && 'value' in entry) {
      examples.push([`examples.${name}.value`, (entry as Record<string, unknown>).value])
    }
  }
  for (const [path, example] of examples) {
    if (validatesExample(example, media.schema, schemas) === false) {
      issues.push({
        code: 'example_invalid',
        severity: 'error',
        message: `${label} ${path} does not match its schema.`,
        nodeId,
      })
    }
  }
  return issues
}

export function validateApiExamples(nodes: CanvasNode[]): CanvasProfileIssue[] {
  const schemas = schemaMap(nodes)
  const issues: CanvasProfileIssue[] = []
  for (const node of nodes) {
    const meta = getEntityMeta(node)
    if (!meta) continue
    if (meta.entityType === 'schema') {
      const name = stringField(meta.fields.name)
      let source: unknown
      try {
        source = JSON.parse(stringField(meta.fields.source))
      } catch {
        continue
      }
      if (!source || typeof source !== 'object' || Array.isArray(source)) continue
      const examples = (source as Record<string, unknown>).examples
      if (!Array.isArray(examples)) continue
      for (const [index, example] of examples.entries()) {
        if (validatesExample(example, source, schemas) === false) {
          issues.push({
            code: 'example_invalid',
            severity: 'error',
            message: `Schema "${name}" examples[${index}] does not match the schema.`,
            nodeId: node.id,
          })
        }
      }
      continue
    }
    if (meta.entityType !== 'endpoint') continue
    let operation: Record<string, unknown>
    try {
      const parsed: unknown = JSON.parse(stringField(meta.fields.operation))
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue
      operation = parsed as Record<string, unknown>
    } catch {
      continue
    }
    const label = `${stringField(meta.fields.method)} ${stringField(meta.fields.path)}`
    const requestContent = objectOrEmpty(objectOrEmpty(operation.requestBody).content)
    for (const [mediaType, media] of Object.entries(requestContent)) {
      issues.push(...mediaIssues(objectOrEmpty(media), schemas, `${label} request ${mediaType}`, node.id))
    }
    for (const [status, response] of Object.entries(objectOrEmpty(operation.responses))) {
      const content = objectOrEmpty(objectOrEmpty(response).content)
      for (const [mediaType, media] of Object.entries(content)) {
        issues.push(...mediaIssues(objectOrEmpty(media), schemas, `${label} ${status} ${mediaType}`, node.id))
      }
    }
    const parameters = Array.isArray(operation.parameters) ? operation.parameters : []
    for (const value of parameters) {
      const parameter = objectOrEmpty(value)
      if (!('example' in parameter)) continue
      if (validatesExample(parameter.example, parameter.schema, schemas) === false) {
        issues.push({
          code: 'example_invalid',
          severity: 'error',
          message: `${label} parameter "${stringField(parameter.name)}" example does not match its schema.`,
          nodeId: node.id,
        })
      }
    }
  }
  return issues
}


export function validateApiOperations(nodes: CanvasNode[]): CanvasProfileIssue[] {
  const issues: CanvasProfileIssue[] = []
  for (const node of nodes) {
    const meta = getEntityMeta(node)
    if (meta?.entityType !== 'endpoint') continue
    let operation: unknown
    try {
      operation = JSON.parse(stringField(meta.fields.operation) || '{}')
    } catch (cause) {
      issues.push({
        code: 'operation_invalid',
        severity: 'error',
        message: `Operation JSON is invalid: ${cause instanceof Error ? cause.message : 'could not parse JSON'}.`,
        nodeId: node.id,
      })
      continue
    }
    if (validateOpenApiDocument({
      openapi: '3.1.0',
      info: { title: 'Operation', version: '1.0.0' },
      paths: { '/operation': { get: operation } },
    })) continue
    const first = validateOpenApiDocument.errors?.[0]
    const path = (first?.instancePath ?? '').replace(/^\/paths\/~1operation\/get/, '') || 'root'
    issues.push({
      code: 'operation_invalid',
      severity: 'error',
      message: `Operation is not a valid OpenAPI 3.1 operation: ${path} ${first?.message ?? 'invalid operation'}.`,
      nodeId: node.id,
    })
  }
  return issues
}


interface RowValidationError {
  instancePath?: string
  message?: string
  keyword?: string
  params?: {
    missingProperty?: string
    allowedValues?: unknown[]
    pattern?: string
    type?: string
    format?: string
    limit?: number
    additionalProperty?: string
  }
}

export interface SchemaRowValidation {
  valid: boolean
  errors: RowValidationError[]
  cells: Record<string, string[]>
  messages: string[]
}

function pathSegments(value: string): string[] {
  return value.split('/').filter(Boolean).map((part) => decodeURIComponent(part).replace(/~1/g, '/').replace(/~0/g, '~'))
}

function prefixPath(prefix: string[], value: string[]): boolean {
  return prefix.length <= value.length && prefix.every((part, index) => part === value[index])
}

function errorTarget(error: RowValidationError): string[] {
  const segments = pathSegments(error.instancePath ?? '')
  return error.keyword === 'required' && error.params?.missingProperty
    ? [...segments, error.params.missingProperty]
    : segments
}

function columnForError(error: RowValidationError, columns: SchemaColumn[]): SchemaColumn | undefined {
  const target = errorTarget(error)
  const sorted = [...columns].sort((left, right) => right.path.length - left.path.length)
  return sorted.find((column) => prefixPath(column.path, target))
    ?? sorted.find((column) => prefixPath(target, column.path))
}

function cellKeyForError(error: RowValidationError, columns: SchemaColumn[]): string | undefined {
  if (columns.length === 0) return undefined
  if (columns.length === 1 && columns[0]?.key === 'value') return 'value'
  return columnForError(error, columns)?.key
}

const TYPE_PHRASES: Record<string, string> = {
  string: 'a string',
  number: 'a number',
  integer: 'an integer',
  boolean: 'a boolean',
  object: 'an object',
  array: 'an array',
  null: 'null',
}

const FORMAT_PHRASES: Record<string, string> = {
  'date-time': 'a date-time like 2026-11-16T10:30:00Z',
  date: 'a date like 2026-11-16',
  email: 'an email address',
  uuid: 'a UUID',
  uri: 'a URI',
}

function plainMessage(error: RowValidationError, columns: SchemaColumn[]): string {
  const column = columnForError(error, columns)
  const target = errorTarget(error)
  const label = column?.label ?? (target.join('.') || 'row')
  const params = error.params ?? {}
  if (error.keyword === 'required') return `${label}: required`
  if (error.keyword === 'enum') {
    const values = Array.isArray(params.allowedValues) ? params.allowedValues.map(String) : []
    return `${label}: must be one of ${values.join(', ')}`
  }
  if (error.keyword === 'pattern') return `${label}: must match ${String(params.pattern ?? '')}`
  if (error.keyword === 'type') {
    const types = String(params.type ?? '').split(',')
    const type = types.find((candidate) => candidate !== 'null') ?? types[0] ?? ''
    const phrase = TYPE_PHRASES[type] ?? type
    const suffix = column?.nullable && type !== 'null' ? ' or null' : ''
    return `${label}: must be ${phrase}${suffix}`
  }
  if (error.keyword === 'format') {
    const format = String(params.format ?? '')
    return `${label}: must be ${FORMAT_PHRASES[format] ?? format}`
  }
  if (error.keyword === 'minimum') return `${label}: must be at least ${String(params.limit ?? '')}`
  if (error.keyword === 'maximum') return `${label}: must be at most ${String(params.limit ?? '')}`
  if (error.keyword === 'minLength') return `${label}: must be at least ${String(params.limit ?? '')} characters`
  if (error.keyword === 'maxLength') return `${label}: must be at most ${String(params.limit ?? '')} characters`
  if (error.keyword === 'additionalProperties') {
    return `${label}: must not have extra property ${String(params.additionalProperty ?? '')}`
  }
  if (error.keyword === 'anyOf' || error.keyword === 'oneOf') return `${label}: must match the schema`
  return `${label}: ${error.message ?? 'is invalid'}`
}

export function validateSchemaRow(
  source: string,
  schemas: Array<{ name: string; source: string }>,
  row: unknown,
  columns: SchemaColumn[],
): SchemaRowValidation {
  const added: string[] = []
  try {
    for (const schema of schemas) {
      const key = `#/components/schemas/${schema.name}`
      try { ajv2020.removeSchema(key) } catch { /* No previous registration. */ }
      try {
        ajv2020.addSchema(JSON.parse(schema.source), key)
        added.push(key)
      } catch {
        // An invalid Schema card is reported elsewhere.
      }
    }
    const validate = ajv2020.compile(JSON.parse(source))
    const valid = validate(row) === true
    const errors = (validate.errors ?? []) as RowValidationError[]
    const cells: Record<string, string[]> = {}
    const messages: string[] = []
    for (const error of errors) {
      const key = cellKeyForError(error, columns)
      const message = `${error.instancePath || 'root'} ${error.message ?? 'is invalid'}`
      if (key) cells[key] = [...(cells[key] ?? []), message]
      const plain = plainMessage(error, columns)
      if (!messages.includes(plain)) messages.push(plain)
    }
    return { valid, errors, cells, messages }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Could not validate row.'
    return { valid: false, errors: [{ message }], cells: {}, messages: [message] }
  } finally {
    for (const key of added) {
      try { ajv2020.removeSchema(key) } catch { /* Already gone. */ }
    }
  }
}
