import { DEFAULT_ONTOLOGY, findEntityType, getEntityMeta } from '../ontology'
import { createNodeId, type CanvasNode, type JsonCanvas } from '../jsonCanvas'
import { isObject, objectOrEmpty } from './document'
import type { JsonObject } from './types'

export interface StandardErrorsResult {
  nodes: CanvasNode[]
  errors: string[]
  added: number
}

const PROBLEM_SOURCE = {
  type: 'object',
  properties: {
    type: { type: 'string', format: 'uri' },
    title: { type: 'string' },
    status: { type: 'integer' },
    detail: { type: 'string' },
    instance: { type: 'string', format: 'uri' },
  },
  required: ['type', 'title', 'status'],
}

function field(node: CanvasNode, key: string): string {
  const value = getEntityMeta(node)?.fields[key]
  return value == null ? '' : String(value)
}

function response(): JsonObject {
  return {
    description: 'Problem details',
    content: {
      'application/problem+json': {
        schema: { $ref: '#/components/schemas/Problem' },
      },
    },
  }
}

function hasClass(responses: JsonObject, prefix: '4' | '5'): boolean {
  return Object.keys(responses).some((status) => new RegExp(`^${prefix}(?:\\d\\d|XX)$`).test(status))
}

export function applyStandardErrors(canvas: JsonCanvas, endpointIds: string[]): StandardErrorsResult {
  const nodes = (canvas.nodes ?? []).map((node) => ({
    ...node,
    app: node.app ? { ...node.app, fields: { ...(getEntityMeta(node)?.fields ?? {}) } } : node.app,
  }))
  const selected = new Set(endpointIds)
  const endpoints = nodes.filter((node) => selected.has(node.id)
    && getEntityMeta(node)?.entityType === 'endpoint')
  if (endpoints.length === 0) return { nodes: [], errors: ['Select at least one endpoint.'], added: 0 }

  const errors: string[] = []
  let added = 0
  let problem = nodes.find((node) => getEntityMeta(node)?.entityType === 'schema' && field(node, 'name') === 'Problem')
  if (!problem) {
    const schemas = nodes.filter((node) => getEntityMeta(node)?.entityType === 'schema')
    const x = schemas.length > 0 ? Math.max(...schemas.map((node) => node.x)) : 960
    const y = Math.max(0, ...schemas.map((node) => node.y + node.height)) + 40
    const definition = findEntityType(DEFAULT_ONTOLOGY, 'schema')
    problem = {
      id: createNodeId(),
      type: 'text',
      x,
      y,
      width: definition?.defaultSize.width ?? 360,
      height: definition?.defaultSize.height ?? 300,
      text: '',
      app: {
        entityType: 'schema',
        fields: {
          name: 'Problem',
          kind: 'api',
          version: '1.0.0',
          owner: '',
          status: 'active',
          reviewStatus: 'needs_review',
          reviewedVersion: '',
          lastReviewed: '',
          reviewIntervalDays: 90,
          source: JSON.stringify(PROBLEM_SOURCE, null, 2),
        },
      },
    }
    nodes.push(problem)
  }

  for (const endpoint of endpoints) {
    const label = `${field(endpoint, 'method')} ${field(endpoint, 'path')}`
    let operation: JsonObject
    try {
      const parsed = JSON.parse(field(endpoint, 'operation'))
      if (!isObject(parsed)) throw new Error('Operation must be an object.')
      operation = parsed
    } catch {
      errors.push(`${label} has invalid operation JSON.`)
      continue
    }
    const responses = objectOrEmpty(operation.responses)
    let changed = false
    for (const prefix of ['4', '5'] as const) {
      if (hasClass(responses, prefix)) continue
      responses[`${prefix}XX`] = response()
      changed = true
      added += 1
    }
    if (!changed) continue
    endpoint.app = {
      ...(endpoint.app ?? {}),
      fields: {
        ...(getEntityMeta(endpoint)?.fields ?? {}),
        operation: JSON.stringify({ ...operation, responses }, null, 2),
      },
    }
  }
  return { nodes: errors.length > 0 ? [] : nodes, errors, added }
}
