import { getEntityMeta } from '../ontology'
import type { CanvasNode } from '../jsonCanvas'
import { isObject, objectOrEmpty, schemaNameFromRef } from './document'
import { endpointResourceName } from './managedRelations'
import type {
  ApiReferenceEndpoint,
  ApiReferenceParameter,
  ApiReferenceResource,
  ApiReferenceResponse,
} from './types'

function field(node: CanvasNode, key: string): string {
  const value = getEntityMeta(node)?.fields[key]
  return value == null ? '' : String(value)
}

function typeName(schema: unknown): string | undefined {
  if (!isObject(schema)) return undefined
  if (schema.type === 'array') return `${typeName(schema.items) ?? 'unknown'}[]`
  if (typeof schema.type === 'string') return schema.type
  if (typeof schema.format === 'string') return schema.format
  return undefined
}

function parametersFor(path: string, operation: Record<string, unknown>): ApiReferenceParameter[] {
  const declared = Array.isArray(operation.parameters) ? operation.parameters.filter(isObject) : []
  const result: ApiReferenceParameter[] = declared.map((parameter) => ({
    name: String(parameter.name ?? ''),
    location: String(parameter.in ?? ''),
    required: parameter.required === true,
    type: typeName(parameter.schema),
    description: parameter.description == null ? undefined : String(parameter.description),
  }))
  for (const match of path.matchAll(/\{([^}]+)\}/g)) {
    const name = match[1]
    if (!name || result.some((parameter) => parameter.name === name && parameter.location === 'path')) continue
    result.push({ name, location: 'path', required: true, type: 'string' })
  }
  return result
}

function requestModels(operation: Record<string, unknown>): string[] {
  const content = objectOrEmpty(objectOrEmpty(operation.requestBody).content)
  return [...new Set(Object.values(content).flatMap((media) => {
    const name = schemaNameFromRef(objectOrEmpty(objectOrEmpty(media).schema).$ref)
    return name ? [name] : []
  }))]
}

function responses(operation: Record<string, unknown>): ApiReferenceResponse[] {
  return Object.entries(objectOrEmpty(operation.responses)).map(([status, response]) => {
    const body = objectOrEmpty(response)
    const models = [...new Set(Object.values(objectOrEmpty(body.content)).flatMap((media) => {
      const name = schemaNameFromRef(objectOrEmpty(objectOrEmpty(media).schema).$ref)
      return name ? [name] : []
    }))]
    return {
      status,
      description: body.description == null ? undefined : String(body.description),
      model: models.join(', ') || undefined,
    }
  })
}

function securityNames(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((entry) => Object.keys(objectOrEmpty(entry)))
    : []
}

export function buildApiReference(nodes: CanvasNode[]): ApiReferenceResource[] {
  const resources = nodes
    .filter((node) => getEntityMeta(node)?.entityType === 'resource')
    .sort((left, right) => left.x - right.x || left.y - right.y || left.id.localeCompare(right.id))
  const api = nodes.find((node) => getEntityMeta(node)?.entityType === 'api_definition')
  let topSecurity: string[] = []
  if (api) {
    try {
      const extra: unknown = JSON.parse(field(api, 'extra') || '{}')
      if (isObject(extra)) topSecurity = securityNames(extra.security)
    } catch {
      topSecurity = []
    }
  }
  const grouped = new Map(resources.map((resource) => [field(resource, 'name'), [] as ApiReferenceEndpoint[]]))
  for (const node of nodes.filter((candidate) => getEntityMeta(candidate)?.entityType === 'endpoint')) {
    let operation: Record<string, unknown> = {}
    try {
      const parsed: unknown = JSON.parse(field(node, 'operation') || '{}')
      if (isObject(parsed)) operation = parsed
    } catch {
      operation = {}
    }
    const path = field(node, 'path')
    const endpoint: ApiReferenceEndpoint = {
      id: node.id,
      method: field(node, 'method').toUpperCase(),
      path,
      summary: operation.summary == null ? undefined : String(operation.summary),
      description: operation.description == null ? undefined : String(operation.description),
      deprecated: operation.deprecated === true || field(node, 'status') === 'deprecated',
      parameters: parametersFor(path, operation),
      requestModels: requestModels(operation),
      responses: responses(operation),
      security: 'security' in operation ? securityNames(operation.security) : topSecurity,
    }
    grouped.get(endpointResourceName(node))?.push(endpoint)
  }
  return resources.map((resource) => {
    const name = field(resource, 'name')
    return {
      id: resource.id,
      name,
      description: field(resource, 'description') || undefined,
      inferred: getEntityMeta(resource)?.inferred === true,
      endpoints: (grouped.get(name) ?? []).sort((left, right) => left.path.localeCompare(right.path) || left.method.localeCompare(right.method)),
    }
  })
}
