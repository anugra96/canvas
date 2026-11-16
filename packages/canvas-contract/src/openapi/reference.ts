import { getEntityMeta } from '../ontology'
import type { CanvasNode } from '../jsonCanvas'
import { isObject, objectOrEmpty, schemaNameFromRef } from './document'
import { endpointResourceName, schemaReferences } from './managedRelations'
import type {
  ApiModelPlacement,
  JsonObject,
  ApiReferenceDocument,
  ApiReferenceEndpoint,
  ApiReferenceParameter,
  ApiReferenceResource,
  ApiReferenceResponse,
  ApiReferenceSummary,
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

function canonicalSecurity(value: unknown): string {
  if (!Array.isArray(value)) return '[]'
  return JSON.stringify(value.flatMap((entry) => {
    if (!isObject(entry)) return []
    return [Object.fromEntries(Object.keys(entry).sort().map((name) => {
      const scopes = entry[name]
      return [name, Array.isArray(scopes) ? scopes.map(String).sort() : []]
    }))]
  }).map((entry) => JSON.stringify(entry)).sort())
}

interface EndpointEntry {
  id: string
  resourceName: string
  operation: Record<string, unknown>
  path: string
  method: string
  deprecated: boolean
}

interface ApiReferenceData {
  resources: ApiReferenceResource[]
  topSecurity: unknown[]
  defaultSecurity: string[]
  schemaSources: Record<string, unknown>
  modelPlacement: Record<string, ApiModelPlacement>
}

function apiTopSecurity(nodes: CanvasNode[]): { defined: boolean; value: unknown[] } {
  const api = nodes.find((node) => getEntityMeta(node)?.entityType === 'api_definition')
  if (!api) return { defined: false, value: [] }
  try {
    const extra: unknown = JSON.parse(field(api, 'extra') || '{}')
    if (!isObject(extra) || !('security' in extra)) return { defined: false, value: [] }
    return { defined: true, value: Array.isArray(extra.security) ? extra.security : [] }
  } catch {
    return { defined: false, value: [] }
  }
}

function classifyModels(
  endpoints: ApiReferenceEndpoint[],
  schemaSources: Record<string, unknown>,
): Record<string, ApiModelPlacement> {
  const usesTargets = new Map<string, string[]>()
  for (const [name, source] of Object.entries(schemaSources)) {
    const targets = schemaReferences(source).filter((target) => target !== name)
    if (targets.length > 0) usesTargets.set(name, targets)
  }
  const directRequest = new Set(endpoints.flatMap((endpoint) => endpoint.requestModels))
  const directResponse = new Set(endpoints.flatMap((endpoint) => (
    endpoint.responses
      .filter((response) => /^[123]/.test(response.status) && response.model)
      .flatMap((response) => response.model!.split(', '))
  )))
  const directError = new Set(endpoints.flatMap((endpoint) => (
    endpoint.responses
      .filter((response) => /^[45]/.test(response.status) && response.model)
      .flatMap((response) => response.model!.split(', '))
  )))

  function closure(seeds: Iterable<string>, blocked = new Set<string>()): Map<string, number> {
    const result = new Map<string, number>()
    const queue = [...seeds].filter((name) => !blocked.has(name)).map((name) => ({ name, depth: 0 }))
    while (queue.length > 0) {
      const next = queue.shift()
      if (!next || result.has(next.name) || blocked.has(next.name)) continue
      result.set(next.name, next.depth)
      for (const target of usesTargets.get(next.name) ?? []) {
        if (!result.has(target) && !blocked.has(target)) queue.push({ name: target, depth: next.depth + 1 })
      }
    }
    return result
  }

  const requestDepth = closure(directRequest)
  const responseDepth = closure(directResponse)
  const sharedSeeds = new Set<string>()
  for (const [name, depth] of requestDepth) {
    if (depth > 0 && (responseDepth.get(name) ?? 0) > 0) sharedSeeds.add(name)
  }
  for (const name of directError) {
    if (!requestDepth.has(name) && !responseDepth.has(name)) sharedSeeds.add(name)
  }
  const directModels = new Set([...directRequest, ...directResponse])
  const sharedDepth = closure(sharedSeeds, directModels)
  const placement: Record<string, ApiModelPlacement> = {}

  for (const [name, depth] of requestDepth) {
    if (sharedDepth.has(name) || directResponse.has(name)) continue
    placement[name] = { region: 'request', depth }
  }
  for (const [name, depth] of responseDepth) {
    if (sharedDepth.has(name) || (directRequest.has(name) && !directResponse.has(name))) continue
    placement[name] = { region: 'response', depth }
  }
  for (const name of sharedDepth.keys()) {
    if (directModels.has(name)) continue
    placement[name] = { region: 'shared', depth: 0 }
  }
  for (const name of Object.keys(schemaSources)) {
    if (!placement[name]) placement[name] = { region: 'unused', depth: 0 }
  }
  return placement
}

function buildApiReferenceData(nodes: CanvasNode[]): ApiReferenceData {
  const resources = nodes
    .filter((node) => getEntityMeta(node)?.entityType === 'resource')
    .sort((left, right) => left.x - right.x || left.y - right.y || left.id.localeCompare(right.id))
  const topSecurity = apiTopSecurity(nodes)
  const grouped = new Map<string, EndpointEntry[]>(resources.map((resource) => [field(resource, 'name'), []]))
  for (const node of nodes.filter((candidate) => getEntityMeta(candidate)?.entityType === 'endpoint')) {
    let operation: Record<string, unknown> = {}
    try {
      const parsed: unknown = JSON.parse(field(node, 'operation') || '{}')
      if (isObject(parsed)) operation = parsed
    } catch {
      operation = {}
    }
    const resourceName = endpointResourceName(node)
    grouped.get(resourceName)?.push({
      id: node.id,
      resourceName,
      operation,
      path: field(node, 'path'),
      method: field(node, 'method').toUpperCase(),
      deprecated: operation.deprecated === true || field(node, 'status') === 'deprecated',
    })
  }
  const orderedEntries: EndpointEntry[] = []
  for (const resource of resources) {
    const entries = grouped.get(field(resource, 'name')) ?? []
    entries.sort((left, right) => left.path.localeCompare(right.path) || left.method.localeCompare(right.method))
    orderedEntries.push(...entries)
  }

  let defaultRequirement = topSecurity.value
  if (!topSecurity.defined && orderedEntries.length > 0) {
    const counts = new Map<string, { value: unknown[]; count: number; first: number }>()
    for (const [index, entry] of orderedEntries.entries()) {
      const requirement = Array.isArray(entry.operation.security) ? entry.operation.security : topSecurity.value
      const key = canonicalSecurity(requirement)
      const current = counts.get(key)
      if (current) current.count += 1
      else counts.set(key, { value: requirement, count: 1, first: index })
    }
    defaultRequirement = [...counts.values()]
      .sort((left, right) => right.count - left.count || left.first - right.first)[0]?.value ?? []
  }
  const defaultKey = canonicalSecurity(defaultRequirement)

  const endpointByResource = new Map<string, ApiReferenceEndpoint[]>()
  for (const entry of orderedEntries) {
    const effectiveSecurity = Array.isArray(entry.operation.security) ? entry.operation.security : topSecurity.value
    const endpoint: ApiReferenceEndpoint = {
      id: entry.id,
      method: entry.method,
      path: entry.path,
      summary: entry.operation.summary == null ? undefined : String(entry.operation.summary),
      description: entry.operation.description == null ? undefined : String(entry.operation.description),
      deprecated: entry.deprecated,
      parameters: parametersFor(entry.path, entry.operation),
      requestModels: requestModels(entry.operation),
      responses: responses(entry.operation),
      security: securityNames(effectiveSecurity),
      securityOverride: canonicalSecurity(effectiveSecurity) !== defaultKey,
    }
    const list = endpointByResource.get(entry.resourceName) ?? []
    list.push(endpoint)
    endpointByResource.set(entry.resourceName, list)
  }

  const referenceResources = resources.map((resource) => {
    const name = field(resource, 'name')
    return {
      id: resource.id,
      name,
      description: field(resource, 'description') || undefined,
      inferred: getEntityMeta(resource)?.inferred === true,
      endpoints: endpointByResource.get(name) ?? [],
    }
  })
  const schemaSources: Record<string, unknown> = {}
  for (const node of nodes.filter((candidate) => getEntityMeta(candidate)?.entityType === 'schema')) {
    const name = field(node, 'name')
    if (!name) continue
    try {
      schemaSources[name] = JSON.parse(field(node, 'source'))
    } catch {
      // Invalid schema JSON is reported by Review and export.
    }
  }
  const endpointList = referenceResources.flatMap((resource) => resource.endpoints)
  return {
    resources: referenceResources,
    topSecurity: topSecurity.value,
    defaultSecurity: securityNames(defaultRequirement),
    schemaSources,
    modelPlacement: classifyModels(endpointList, schemaSources),
  }
}

export function buildApiReference(nodes: CanvasNode[]): ApiReferenceResource[] {
  return buildApiReferenceData(nodes).resources
}

export function buildApiReferenceDocument(nodes: CanvasNode[]): ApiReferenceDocument {
  const data = buildApiReferenceData(nodes)
  const resources = data.resources
  const api = nodes.find((node) => getEntityMeta(node)?.entityType === 'api_definition')
  const summary: ApiReferenceSummary = {
    title: api ? field(api, 'title') : 'API',
    version: api ? field(api, 'version') : '',
    description: api ? field(api, 'description') || undefined : undefined,
    servers: api ? field(api, 'servers').split(/\r?\n/).map((line) => line.trim()).filter(Boolean) : [],
    globalSecurity: securityNames(data.topSecurity),
    defaultSecurity: data.defaultSecurity,
    resourceCount: resources.length,
    endpointCount: resources.reduce((count, resource) => count + resource.endpoints.length, 0),
    schemaCount: nodes.filter((node) => getEntityMeta(node)?.entityType === 'schema').length,
  }
  const securityUsage: Record<string, number> = {}
  for (const resource of resources) {
    for (const endpoint of resource.endpoints) {
      for (const scheme of endpoint.security) {
        securityUsage[scheme] = (securityUsage[scheme] ?? 0) + 1
      }
    }
  }
  const securitySchemes: Record<string, JsonObject> = {}
  for (const node of nodes.filter((candidate) => getEntityMeta(candidate)?.entityType === 'security_scheme')) {
    const name = field(node, 'name')
    if (!name) continue
    try {
      const parsed: unknown = JSON.parse(field(node, 'definition'))
      if (isObject(parsed)) securitySchemes[name] = parsed
    } catch {
      // Invalid security JSON is reported by export.
    }
  }
  return {
    summary,
    resources,
    securityUsage,
    schemaSources: data.schemaSources,
    securitySchemes,
    modelPlacement: data.modelPlacement,
  }
}
