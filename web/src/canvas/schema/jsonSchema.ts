import Ajv from 'ajv'
import Ajv2020 from 'ajv/dist/2020'

import {
  getEntityMeta,
  type CanvasEdge,
  type CanvasNode,
  type CanvasProfileIssue,
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
const ajv2020 = new Ajv2020({ allErrors: true, strict: false, validateFormats: false })

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

export function analyzeJsonSchema(source: string): SchemaAnalysis {
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
  const schemaUri = record && typeof record.$schema === 'string' ? record.$schema : ''
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
  if (diagnostics.length === 0 && record && typeof record.$schema !== 'string') {
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
  }

  for (const schema of schemas) {
    const fields = getEntityMeta(schema)?.fields ?? {}
    const name = nodeName(schema)
    const analysis = analyzeJsonSchema(stringField(fields.source))
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
    if (reviewReasons.length > 0) {
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
