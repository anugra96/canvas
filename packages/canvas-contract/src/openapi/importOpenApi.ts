import { createNodeId } from '../jsonCanvas'
import { API_PROFILE, profileMetadata } from '../profile'
import type { CanvasNode, JsonCanvas } from '../jsonCanvas'
import { DEFAULT_ONTOLOGY, findEntityType, type EntityFields } from '../ontology'
import { isObject, objectOrEmpty, parseOpenApiSource } from './document'
import { withManagedRelations } from './managedRelations'
import type { JsonObject, OpenApiImportResult } from './types'

const METHOD_ORDER = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'] as const

function makeNode(
  entityType: string,
  x: number,
  y: number,
  fields: EntityFields,
  app: Record<string, unknown> = {},
): CanvasNode {
  const definition = findEntityType(DEFAULT_ONTOLOGY, entityType)
  return {
    id: createNodeId(),
    type: 'text',
    x: Math.round(x),
    y: Math.round(y),
    width: definition?.defaultSize.width ?? 360,
    height: definition?.defaultSize.height ?? 240,
    text: '',
    app: { entityType, fields, ...app },
  }
}

function stringValue(value: unknown): string {
  return value == null ? '' : String(value)
}

function jsonText(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function tagList(document: JsonObject): JsonObject[] {
  return Array.isArray(document.tags) ? document.tags.filter(isObject) : []
}

function inferResourceName(path: string): string {
  const segments = path.split('/').filter(Boolean)
  return segments.find((segment) => !/^v\d+(?:\.\d+)*$/i.test(segment))?.replace(/[{}]/g, '') || 'root'
}

function apiExtra(document: JsonObject): JsonObject {
  const known = new Set(['openapi', 'info', 'servers', 'paths', 'components', 'tags', 'security'])
  const extra: JsonObject = {}
  for (const [key, value] of Object.entries(document)) {
    if (!known.has(key)) extra[key] = value
  }
  if ('security' in document) extra.security = document.security
  const info = objectOrEmpty(document.info)
  const infoExtra = Object.fromEntries(
    Object.entries(info).filter(([key]) => key !== 'title' && key !== 'version' && key !== 'description'),
  )
  if (Object.keys(infoExtra).length > 0) extra.info = infoExtra
  const servers = Array.isArray(document.servers) ? document.servers : []
  if (servers.some((server) => isObject(server) && Object.keys(server).some((key) => key !== 'url'))) {
    extra.serverDetails = servers
  }
  const components = objectOrEmpty(document.components)
  const componentExtra = Object.fromEntries(
    Object.entries(components).filter(([key]) => key !== 'schemas' && key !== 'securitySchemes'),
  )
  if (Object.keys(componentExtra).length > 0) extra.components = componentExtra
  return extra
}

export function importOpenApi(source: string | unknown): OpenApiImportResult {
  const parsed = parseOpenApiSource(source)
  const document = parsed.document
  const info = objectOrEmpty(document.info)
  const title = stringValue(info.title).trim() || 'Imported API'
  const nodes: CanvasNode[] = []
  const operationEntries: Array<{ path: string; method: string; operation: JsonObject }> = []

  const paths = objectOrEmpty(document.paths)
  for (const [path, item] of Object.entries(paths)) {
    if (!isObject(item)) continue
    for (const method of METHOD_ORDER) {
      const operation = item[method]
      if (isObject(operation)) operationEntries.push({ path, method, operation })
    }
  }

  const tagDefinitions = tagList(document)
  const tagByName = new Map(tagDefinitions.map((tag) => [stringValue(tag.name), tag]))
  const resourceOrder: string[] = []
  for (const tag of tagDefinitions) {
    const name = stringValue(tag.name).trim()
    if (name && !resourceOrder.includes(name)) resourceOrder.push(name)
  }
  for (const { operation } of operationEntries) {
    const tags = Array.isArray(operation.tags)
      ? operation.tags.filter((tag): tag is string => typeof tag === 'string')
      : []
    const name = tags[0]?.trim()
    if (name && !resourceOrder.includes(name)) resourceOrder.push(name)
  }
  for (const { path, operation } of operationEntries) {
    const tags = Array.isArray(operation.tags)
      ? operation.tags.filter((tag): tag is string => typeof tag === 'string')
      : []
    const inferred = tags.length === 0 ? inferResourceName(path) : ''
    if (inferred && !resourceOrder.includes(inferred)) resourceOrder.push(inferred)
  }

  const inferredNames = new Set(operationEntries
    .filter(({ operation }) => !Array.isArray(operation.tags) || operation.tags.length === 0)
    .map(({ path }) => inferResourceName(path)))
  const resources = new Map<string, CanvasNode>()
  const endpointsByResource = new Map<string, typeof operationEntries>()
  for (const entry of operationEntries) {
    const tags = Array.isArray(entry.operation.tags)
      ? entry.operation.tags.filter((tag): tag is string => typeof tag === 'string')
      : []
    const resourceName = tags[0]?.trim() || inferResourceName(entry.path)
    const list = endpointsByResource.get(resourceName) ?? []
    list.push(entry)
    endpointsByResource.set(resourceName, list)
  }
  const maxEndpoints = Math.max(0, ...[...endpointsByResource.values()].map((list) => list.length))
  let rowY = 80
  for (const name of resourceOrder) {
    const tag = tagByName.get(name)
    const inferred = inferredNames.has(name)
    const tagExtra = tag
      ? Object.fromEntries(Object.entries(tag).filter(([key]) => !['name', 'description'].includes(key)))
      : {}
    const node = makeNode('resource', 560, rowY, {
      name,
      description: stringValue(tag?.description),
      owner: stringValue(tag?.['x-owner']),
    }, {
      ...(inferred ? { inferred: true, inferredName: name } : {}),
      ...(!inferred && !tag ? { declaredTag: false } : {}),
      ...(Object.keys(tagExtra).length > 0 ? { tagExtra } : {}),
    })
    nodes.push(node)
    resources.set(name, node)
    const endpoints = endpointsByResource.get(name) ?? []
    for (const [endpointIndex, { path, method, operation }] of endpoints.entries()) {
      nodes.push(makeNode('endpoint', 960 + endpointIndex * 440, rowY, {
        method: method.toUpperCase(),
        path,
        status: operation.deprecated === true ? 'deprecated' : 'active',
        operation: jsonText(operation),
      }))
    }
    rowY += Math.max(220, endpoints.length > 0 ? 300 : 200) + 80
  }

  const servers = Array.isArray(document.servers)
    ? document.servers.map((server) => isObject(server) ? stringValue(server.url) : stringValue(server)).filter(Boolean)
    : []
  const api = makeNode('api_definition', 80, 80, {
    title,
    version: stringValue(info.version) || '1.0.0',
    description: stringValue(info.description),
    servers: servers.join('\n'),
    owner: stringValue(objectOrEmpty(info.contact).name),
    status: 'active',
    extra: jsonText(apiExtra(document)),
  })
  nodes.push(api)

  const schemaEntries = Object.entries(objectOrEmpty(objectOrEmpty(document.components).schemas))
  for (const [index, [name, schema]] of schemaEntries.entries()) {
    const node = makeNode('schema', 960 + Math.max(1, maxEndpoints) * 440 + 80, 80 + index * 500, {
      name,
      kind: 'api',
      version: stringValue(objectOrEmpty(schema)['x-version']) || '1.0.0',
      owner: stringValue(objectOrEmpty(schema)['x-owner']),
      status: 'active',
      reviewStatus: 'needs_review',
      reviewedVersion: '',
      lastReviewed: '',
      reviewIntervalDays: 90,
      source: jsonText(schema),
    })
    nodes.push(node)
  }

  const securityEntries = Object.entries(objectOrEmpty(objectOrEmpty(document.components).securitySchemes))
  for (const [index, [name, scheme]] of securityEntries.entries()) {
    const definition = objectOrEmpty(scheme)
    nodes.push(makeNode('security_scheme', 80, 460 + index * 340, {
      name,
      type: stringValue(definition.type) || 'http',
      description: stringValue(definition.description),
      definition: jsonText(definition),
    }))
  }

  const canvas: JsonCanvas = {
    nodes,
    edges: [],
    app: profileMetadata(API_PROFILE),
  }
  return {
    title,
    canvas: withManagedRelations(canvas),
    warnings: [
      ...parsed.warnings,
      ...(resourceOrder.some((name) => !tagDefinitions.some((tag) => stringValue(tag.name) === name))
        ? [`Inferred resources: ${resourceOrder.filter((name) => !tagDefinitions.some((tag) => stringValue(tag.name) === name)).join(', ')}.`]
        : []),
    ],
  }
}
