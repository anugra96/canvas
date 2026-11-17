import { getEdgeMeta, getEntityMeta } from '../ontology'
import type { CanvasEdge, CanvasNode, JsonCanvas } from '../jsonCanvas'
import { isObject, objectOrEmpty, schemaNameFromRef } from './document'
import type { JsonObject } from './types'

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'] as const

function stringField(node: CanvasNode, key: string): string {
  const value = getEntityMeta(node)?.fields[key]
  return value == null ? '' : String(value)
}

function operationFor(node: CanvasNode): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(stringField(node, 'operation') || '{}')
    return isObject(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function nodeType(node: CanvasNode | undefined): string {
  return node ? getEntityMeta(node)?.entityType ?? '' : ''
}

function refsForSchema(schema: unknown, result = new Set<string>()): Set<string> {
  if (Array.isArray(schema)) {
    for (const item of schema) refsForSchema(item, result)
    return result
  }
  if (!isObject(schema)) return result
  const name = schemaNameFromRef(schema.$ref)
  if (name) result.add(name)
  for (const value of Object.values(schema)) refsForSchema(value, result)
  return result
}

function responseBody(value: unknown, componentResponses: JsonObject, seen = new Set<string>()): JsonObject {
  const response = objectOrEmpty(value)
  if (typeof response.$ref !== 'string') return response
  const prefix = '#/components/responses/'
  if (!response.$ref.startsWith(prefix)) return response
  const name = decodeURIComponent(response.$ref.slice(prefix.length))
  if (seen.has(name)) return response
  seen.add(name)
  return responseBody(componentResponses[name], componentResponses, seen)
}

function operationRefs(
  operation: Record<string, unknown>,
  key: 'request' | 'responses',
  componentResponses: JsonObject = {},
): Array<{ name: string; status?: string; mediaType?: string }> {
  const refs: Array<{ name: string; status?: string; mediaType?: string }> = []
  if (key === 'request') {
    const content = objectOrEmpty(objectOrEmpty(operation.requestBody).content)
    for (const [mediaType, media] of Object.entries(content)) {
      for (const name of refsForSchema(objectOrEmpty(media).schema)) {
        refs.push({ name, mediaType })
      }
    }
    return refs
  }
  const responses = objectOrEmpty(operation.responses)
  for (const [status, response] of Object.entries(responses)) {
    const content = objectOrEmpty(responseBody(response, componentResponses).content)
    for (const [mediaType, media] of Object.entries(content)) {
      for (const name of refsForSchema(objectOrEmpty(media).schema)) {
        refs.push({ name, status, mediaType })
      }
    }
  }
  return refs
}

function securityNames(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => Object.keys(objectOrEmpty(entry)))
}

function managedId(relationType: string, from: string, to: string, detail = ''): string {
  return `managed:${relationType}:${from}:${to}${detail ? `:${detail}` : ''}`
}

function managedEdge(
  relationType: 'contains' | 'accepts' | 'returns' | 'authenticates_via' | 'uses',
  from: string,
  to: string,
  options: {
    label?: string
    status?: string
    mediaType?: string
    endpoint?: string
    detail?: string
    fromSide?: 'top' | 'right' | 'bottom' | 'left'
    toSide?: 'top' | 'right' | 'bottom' | 'left'
    fromEnd?: 'none' | 'arrow'
    toEnd?: 'none' | 'arrow'
  } = {},
): CanvasEdge {
  return {
    id: managedId(relationType, from, to, options.detail),
    fromNode: from,
    toNode: to,
    ...(options.fromSide ? { fromSide: options.fromSide } : {}),
    ...(options.toSide ? { toSide: options.toSide } : {}),
    ...(options.fromEnd ? { fromEnd: options.fromEnd } : {}),
    toEnd: options.toEnd ?? 'arrow',
    ...(options.label ? { label: options.label } : {}),
    app: {
      relationType,
      managed: true,
      ...(options.status ? { status: options.status } : {}),
      ...(options.mediaType ? { mediaType: options.mediaType } : {}),
      ...(options.endpoint ? { endpoint: options.endpoint } : {}),
    },
  }
}

export function schemaReferences(schema: unknown): string[] {
  return [...refsForSchema(schema)]
}

function inferredResourceName(path: string): string {
  const segments = path.split('/').filter(Boolean)
  return segments.find((segment) => !/^v\d+(?:\.\d+)*$/i.test(segment))?.replace(/[{}]/g, '') || 'root'
}

export function endpointResourceName(node: CanvasNode): string {
  const operation = operationFor(node)
  const tags = Array.isArray(operation.tags)
    ? operation.tags.filter((tag): tag is string => typeof tag === 'string' && Boolean(tag.trim()))
    : []
  return tags[0]?.trim() || inferredResourceName(stringField(node, 'path'))
}

export function deriveManagedRelations(canvas: Pick<JsonCanvas, 'nodes' | 'edges'>): CanvasEdge[] {
  const nodes = canvas.nodes ?? []
  const api = nodes.find((node) => nodeType(node) === 'api_definition')
  if (!api) return []
  const resources = nodes.filter((node) => nodeType(node) === 'resource')
  const endpoints = nodes.filter((node) => nodeType(node) === 'endpoint')
  const schemas = nodes.filter((node) => nodeType(node) === 'schema')
  const security = nodes.filter((node) => nodeType(node) === 'security_scheme')
  const schemaByName = new Map(schemas.map((node) => [stringField(node, 'name'), node]))
  const resourceByName = new Map(resources.map((node) => [stringField(node, 'name'), node]))
  const securityByName = new Map(security.map((node) => [stringField(node, 'name'), node]))
  let apiExtra: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(stringField(api, 'extra') || '{}')
    apiExtra = isObject(parsed) ? parsed : {}
  } catch {
    apiExtra = {}
  }
  const topSecurity = securityNames(apiExtra.security)
  const componentResponses = objectOrEmpty(objectOrEmpty(apiExtra.components).responses)
  const edges: CanvasEdge[] = []

  for (const resource of resources) {
    edges.push(managedEdge('contains', api.id, resource.id))
  }
  for (const scheme of security) {
    edges.push(managedEdge('contains', api.id, scheme.id))
  }

  for (const endpoint of endpoints) {
    const operation = operationFor(endpoint)
    const path = stringField(endpoint, 'path')
    const method = stringField(endpoint, 'method').toLowerCase()
    const endpointKey = `${method.toUpperCase()} ${path}`
    const resource = resourceByName.get(endpointResourceName(endpoint))
    if (resource) edges.push(managedEdge('contains', resource.id, endpoint.id))

    for (const ref of operationRefs(operation, 'request')) {
      const schema = schemaByName.get(ref.name)
      if (schema) {
        edges.push(managedEdge('accepts', endpoint.id, schema.id, {
          mediaType: ref.mediaType,
          endpoint: endpointKey,
          detail: ref.mediaType,
          fromSide: 'left',
          toSide: 'right',
          fromEnd: 'arrow',
          toEnd: 'none',
        }))
      }
    }
    for (const ref of operationRefs(operation, 'responses', componentResponses)) {
      const schema = schemaByName.get(ref.name)
      if (schema) {
        edges.push(managedEdge('returns', endpoint.id, schema.id, {
          label: ref.status,
          status: ref.status,
          mediaType: ref.mediaType,
          endpoint: endpointKey,
          detail: `${ref.status}:${ref.mediaType}`,
          fromSide: 'right',
          toSide: 'left',
          toEnd: 'arrow',
        }))
      }
    }

    const effectiveSecurity = 'security' in operation ? securityNames(operation.security) : topSecurity
    for (const name of effectiveSecurity) {
      const scheme = securityByName.get(name)
      if (scheme) edges.push(managedEdge('authenticates_via', endpoint.id, scheme.id))
    }
  }

  for (const name of topSecurity) {
    const scheme = securityByName.get(name)
    if (scheme) edges.push(managedEdge('authenticates_via', api.id, scheme.id))
  }

  for (const schema of schemas) {
    let parsed: unknown = {}
    try {
      parsed = JSON.parse(stringField(schema, 'source') || '{}')
    } catch {
      parsed = {}
    }
    for (const ref of refsForSchema(parsed)) {
      if (ref === stringField(schema, 'name')) continue
      const target = schemaByName.get(ref)
      if (target) edges.push(managedEdge('uses', schema.id, target.id, { detail: ref }))
    }
  }

  return edges.filter((edge) => !(edge.fromNode === edge.toNode))
}

export function withManagedRelations(canvas: JsonCanvas): JsonCanvas {
  const managed = deriveManagedRelations(canvas)
  const manual = (canvas.edges ?? []).filter((edge) => !getEdgeMeta(edge)?.managed)
  return { ...canvas, edges: [...manual, ...managed] }
}

export { HTTP_METHODS }
