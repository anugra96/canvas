import { getEntityMeta } from '../ontology'
import type { CanvasNode, JsonCanvas } from '../jsonCanvas'
import { stringify as stringifyYaml } from 'yaml'
import { isObject, objectOrEmpty } from './document'
import { orderedApiEndpoints } from './layout'
import { buildSecuritySchemeDefinition } from './securityScheme'
import type { JsonObject } from './types'

function stringField(node: CanvasNode, key: string): string {
  const value = getEntityMeta(node)?.fields[key]
  return value == null ? '' : String(value)
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

export interface OpenApiExportIssue {
  cardId: string
  label: string
  field: string
  message: string
}

export class OpenApiExportError extends Error {
  readonly issues: OpenApiExportIssue[]

  constructor(issues: OpenApiExportIssue[]) {
    super(`Cannot export OpenAPI: ${issues.length} ${issues.length === 1 ? 'card contains' : 'cards contain'} invalid JSON.`)
    this.issues = issues
  }
}

function cardLabel(node: CanvasNode): string {
  const fields = getEntityMeta(node)?.fields ?? {}
  return String(fields.name ?? fields.title ?? fields.path ?? node.id)
}

function parseCardJson(node: CanvasNode, fieldKey: string, issues: OpenApiExportIssue[]): unknown {
  try {
    return JSON.parse(stringField(node, fieldKey))
  } catch {
    issues.push({
      cardId: node.id,
      label: cardLabel(node),
      field: fieldKey,
      message: `${cardLabel(node)} has invalid ${fieldKey} JSON.`,
    })
    return undefined
  }
}

export function exportOpenApiDocument(canvas: JsonCanvas): JsonObject {
  const nodes = canvas.nodes ?? []
  const api = nodes.find((node) => nodeType(node) === 'api_definition')
  if (!api) throw new Error('The canvas has no API card.')
  const issues: OpenApiExportIssue[] = []
  const apiExtra = parseCardJson(api, 'extra', issues)
  const operations = new Map<string, unknown>()
  for (const endpoint of nodes.filter((node) => nodeType(node) === 'endpoint')) {
    operations.set(endpoint.id, parseCardJson(endpoint, 'operation', issues))
  }
  const schemaSources = new Map<string, unknown>()
  for (const schema of nodes.filter((node) => nodeType(node) === 'schema')) {
    schemaSources.set(schema.id, parseCardJson(schema, 'source', issues))
  }
  const securityDefinitions = new Map<string, unknown>()
  for (const security of nodes.filter((node) => nodeType(node) === 'security_scheme')) {
    securityDefinitions.set(security.id, parseCardJson(security, 'definition', issues))
  }
  if (issues.length > 0) throw new OpenApiExportError(issues)

  const extra = objectOrEmpty(apiExtra)
  const topExtra = { ...extra }
  const info = objectOrEmpty(topExtra.info)
  const componentExtra = topExtra.components
  delete topExtra.info
  delete topExtra.serverDetails
  delete topExtra.components
  delete topExtra['x-status']
  delete topExtra['x-review-status']
  delete topExtra['x-reviewed-version']
  delete topExtra['x-last-reviewed']
  delete topExtra['x-review-interval-days']
  const title = stringField(api, 'title')
  const version = stringField(api, 'version')
  const description = stringField(api, 'description')
  const owner = stringField(api, 'owner').trim()
  const contact = objectOrEmpty(info.contact)
  const infoContact = owner ? { ...contact, name: owner } : contact
  const paths: JsonObject = {}

  const endpoints = orderedApiEndpoints(nodes)
  for (const endpoint of endpoints) {
    const path = stringField(endpoint, 'path')
    const method = stringField(endpoint, 'method').toLowerCase()
    if (!path || !method) continue
    const operation = objectOrEmpty(operations.get(endpoint.id))
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
    schemas[name] = schemaSources.get(schema.id)
  }

  const securitySchemes: JsonObject = {}
  for (const security of nodes.filter((node) => nodeType(node) === 'security_scheme')) {
    const name = stringField(security, 'name')
    if (!name) continue
    const base = objectOrEmpty(securityDefinitions.get(security.id))
    securitySchemes[name] = buildSecuritySchemeDefinition(
      getEntityMeta(security)?.fields ?? {},
      base,
    )
  }

  const components = {
    ...objectOrEmpty(componentExtra),
    ...(Object.keys(schemas).length > 0 ? { schemas } : {}),
    ...(Object.keys(securitySchemes).length > 0 ? { securitySchemes } : {}),
  }
  const tags = tagsFromResources(nodes)
  const servers = serversFor(api, extra)
  const status = stringField(api, 'status') || 'active'
  const reviewStatus = stringField(api, 'reviewStatus') || 'needs_review'
  const reviewedVersion = stringField(api, 'reviewedVersion').trim()
  const lastReviewed = stringField(api, 'lastReviewed').trim()
  const reviewIntervalDays = Number(getEntityMeta(api)?.fields.reviewIntervalDays ?? 90)
  const document: JsonObject = {
    ...topExtra,
    ...(status !== 'active' ? { 'x-status': status } : {}),
    ...(reviewStatus !== 'needs_review' ? { 'x-review-status': reviewStatus } : {}),
    ...(reviewedVersion ? { 'x-reviewed-version': reviewedVersion } : {}),
    ...(lastReviewed ? { 'x-last-reviewed': lastReviewed } : {}),
    ...(Number.isFinite(reviewIntervalDays) && reviewIntervalDays !== 90
      ? { 'x-review-interval-days': reviewIntervalDays }
      : {}),
    openapi: '3.1.0',
    info: {
      ...info,
      title,
      version,
      ...(description ? { description } : {}),
      ...(Object.keys(infoContact).length > 0 ? { contact: infoContact } : {}),
    },
    ...(servers ? { servers } : {}),
    paths,
    ...(Object.keys(components).length > 0 ? { components } : {}),
    ...(tags.length > 0 ? { tags } : {}),
  }
  return document
}

export function exportOpenApiCanvas(canvas: JsonCanvas): JsonObject {
  return exportOpenApiDocument(canvas)
}

export function stringifyOpenApiYaml(document: JsonObject): string {
  return stringifyYaml(document)
}
