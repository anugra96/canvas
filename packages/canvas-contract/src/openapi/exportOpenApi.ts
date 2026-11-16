import { getEntityMeta } from '../ontology'
import type { CanvasNode, JsonCanvas } from '../jsonCanvas'
import { isObject, objectOrEmpty } from './document'
import type { JsonObject } from './types'

function stringField(node: CanvasNode, key: string): string {
  const value = getEntityMeta(node)?.fields[key]
  return value == null ? '' : String(value)
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

function nodeType(node: CanvasNode): string {
  return getEntityMeta(node)?.entityType ?? ''
}

function resources(nodes: CanvasNode[]): CanvasNode[] {
  return nodes
    .filter((node) => nodeType(node) === 'resource')
    .sort((left, right) => left.x - right.x || left.y - right.y || left.id.localeCompare(right.id))
}

function tagsFromResources(nodes: CanvasNode[]): JsonObject[] {
  return resources(nodes).flatMap((node) => {
    const meta = getEntityMeta(node)
    if (!meta) return []
    const inferred = meta.inferred === true
    const declared = meta.declaredTag !== false
    const name = stringField(node, 'name')
    const description = stringField(node, 'description')
    const originalName = typeof meta.inferredName === 'string' ? meta.inferredName : name
    if (inferred && name === originalName && !description.trim()) return []
    if (!inferred && !declared && !description.trim()) return []
    const tagExtra = isObject(meta.tagExtra) ? meta.tagExtra : {}
    const owner = stringField(node, 'owner')
    return [{
      name,
      ...(description ? { description } : {}),
      ...(owner && !('x-owner' in tagExtra) ? { 'x-owner': owner } : {}),
      ...tagExtra,
    }]
  })
}

function serversFor(api: CanvasNode, extra: JsonObject): unknown[] | undefined {
  const lines = stringField(api, 'servers').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (lines.length === 0) return undefined
  const details = Array.isArray(extra.serverDetails) ? extra.serverDetails : []
  return lines.map((url, index) => {
    const detail = details[index]
    return isObject(detail) ? { ...detail, url } : { url }
  })
}

export function exportOpenApiCanvas(canvas: JsonCanvas): JsonObject {
  const nodes = canvas.nodes ?? []
  const api = nodes.find((node) => nodeType(node) === 'api_definition')
  if (!api) throw new Error('The canvas has no API card.')
  const extra = objectOrEmpty(parseJson(stringField(api, 'extra')))
  const topExtra = { ...extra }
  const info = objectOrEmpty(topExtra.info)
  const componentExtra = topExtra.components
  delete topExtra.info
  delete topExtra.serverDetails
  delete topExtra.components
  const title = stringField(api, 'title')
  const version = stringField(api, 'version')
  const description = stringField(api, 'description')
  const paths: JsonObject = {}

  const endpoints = nodes
    .filter((node) => nodeType(node) === 'endpoint')
    .sort((left, right) => stringField(left, 'path').localeCompare(stringField(right, 'path'))
      || stringField(left, 'method').localeCompare(stringField(right, 'method'))
      || left.id.localeCompare(right.id))
  for (const endpoint of endpoints) {
    const path = stringField(endpoint, 'path')
    const method = stringField(endpoint, 'method').toLowerCase()
    if (!path || !method) continue
    const operation = objectOrEmpty(parseJson(stringField(endpoint, 'operation')))
    if (stringField(endpoint, 'status') === 'deprecated') operation.deprecated = true
    else if (operation.deprecated === true) delete operation.deprecated
    const item = isObject(paths[path]) ? paths[path] as JsonObject : {}
    item[method] = operation
    paths[path] = item
  }

  const schemas: JsonObject = {}
  for (const schema of nodes.filter((node) => nodeType(node) === 'schema')) {
    const name = stringField(schema, 'name')
    if (!name) continue
    const source = parseJson(stringField(schema, 'source'))
    if (source !== undefined) schemas[name] = source
  }

  const securitySchemes: JsonObject = {}
  for (const security of nodes.filter((node) => nodeType(node) === 'security_scheme')) {
    const name = stringField(security, 'name')
    if (!name) continue
    const definition = parseJson(stringField(security, 'definition'))
    if (definition !== undefined) securitySchemes[name] = definition
  }

  const components = {
    ...objectOrEmpty(componentExtra),
    ...(Object.keys(schemas).length > 0 ? { schemas } : {}),
    ...(Object.keys(securitySchemes).length > 0 ? { securitySchemes } : {}),
  }
  const tags = tagsFromResources(nodes)
  const servers = serversFor(api, extra)
  const document: JsonObject = {
    ...topExtra,
    openapi: '3.1.0',
    info: {
      ...info,
      title,
      version,
      ...(description ? { description } : {}),
    },
    ...(servers ? { servers } : {}),
    paths,
    ...(Object.keys(components).length > 0 ? { components } : {}),
    ...(tags.length > 0 ? { tags } : {}),
  }
  return document
}
