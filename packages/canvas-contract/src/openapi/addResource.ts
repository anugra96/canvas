import { DEFAULT_ONTOLOGY, findEntityType, getEntityMeta, type EntityFields } from '../ontology'
import { createNodeId, type CanvasNode, type JsonCanvas } from '../jsonCanvas'
import type { JsonObject } from './types'

export interface AddApiResourceInput {
  singular: string
  plural: string
  pathPrefix: string
  idParameter: string
}

export interface AddApiResourceResult {
  nodes: CanvasNode[]
  errors: string[]
}

function makeNode(
  entityType: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fields: EntityFields,
): CanvasNode {
  const definition = findEntityType(DEFAULT_ONTOLOGY, entityType)
  return {
    id: createNodeId(),
    type: 'text',
    x: Math.round(x),
    y: Math.round(y),
    width: width || (definition?.defaultSize.width ?? 360),
    height: height || (definition?.defaultSize.height ?? 240),
    text: '',
    app: { entityType, fields },
  }
}

function field(node: CanvasNode, key: string): string {
  const value = getEntityMeta(node)?.fields[key]
  return value == null ? '' : String(value)
}

function pascal(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join('')
}

function normalizePrefix(value: string): string {
  const trimmed = value.trim().replace(/^\/+|\/+$/g, '')
  return trimmed ? `/${trimmed}` : ''
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function problemResponses(problem: boolean): JsonObject {
  if (!problem) return {}
  const response = (description: string) => ({
    description,
    content: {
      'application/problem+json': {
        schema: { $ref: '#/components/schemas/Problem' },
      },
    },
  })
  return { '4XX': response('Client error'), '5XX': response('Server error') }
}

export function addApiResource(canvas: JsonCanvas, input: AddApiResourceInput): AddApiResourceResult {
  const singular = input.singular.trim()
  const plural = input.plural.trim()
  const prefix = normalizePrefix(input.pathPrefix)
  const idParameter = input.idParameter.trim()
  const name = pascal(singular)
  const errors: string[] = []
  if (!singular || !plural || !idParameter) errors.push('Singular name, plural name, and id parameter are required.')
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) errors.push('Singular name must contain letters or numbers.')
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(idParameter)) errors.push('Id parameter must be a valid parameter name.')

  const nodes = canvas.nodes ?? []
  const existingNames = new Set(nodes.map((node) => field(node, 'name')).filter(Boolean))
  const schemaNames = [`${name}`, `${name}Create`, `${name}Update`, `${name}List`]
  for (const candidate of [singular, plural]) {
    if (existingNames.has(candidate)) errors.push(`The name "${candidate}" already exists.`)
  }
  for (const schemaName of schemaNames) {
    if (existingNames.has(schemaName)) errors.push(`The schema name "${schemaName}" already exists.`)
  }
  const collectionPath = `${prefix}/${plural}`
  const itemPath = `${collectionPath}/{${idParameter}}`
  const pairs: Array<[string, string]> = [
    ['GET', collectionPath],
    ['POST', collectionPath],
    ['GET', itemPath],
    ['PATCH', itemPath],
    ['DELETE', itemPath],
  ]
  for (const [method, path] of pairs) {
    if (nodes.some((node) => getEntityMeta(node)?.entityType === 'endpoint'
      && field(node, 'method').toUpperCase() === method
      && field(node, 'path') === path)) {
      errors.push(`${method} ${path} already exists.`)
    }
  }
  if (errors.length > 0) return { nodes: [], errors }

  const resources = nodes.filter((node) => getEntityMeta(node)?.entityType === 'resource')
  const schemas = nodes.filter((node) => getEntityMeta(node)?.entityType === 'schema')
  const laneX = resources.length > 0
    ? Math.min(...resources.map((node) => node.x))
    : Math.max(0, ...nodes.map((node) => node.x + node.width + 80))
  const endpointHeight = 220
  const endpointGap = 24
  const lanePadding = 24
  const laneHeader = 52
  const laneWidth = 408
  const laneBottom = Math.max(0, ...nodes
    .filter((node) => node.x < laneX + laneWidth && node.x + node.width > laneX)
    .map((node) => node.y + node.height))
  const laneY = laneBottom + 80
  const laneHeight = laneHeader + lanePadding * 2 + pairs.length * endpointHeight + (pairs.length - 1) * endpointGap
  const problem = schemas.some((node) => field(node, 'name') === 'Problem')

  const requestColumns = schemas.filter((node) => node.x < laneX).map((node) => node.x)
  const responseColumns = schemas.filter((node) => node.x > laneX).map((node) => node.x)
  const requestX = requestColumns.length > 0 ? Math.max(...requestColumns) : laneX - 440
  const responseX = responseColumns.length > 0 ? Math.min(...responseColumns) : laneX + laneWidth + 80
  const requestY = requestColumns.length > 0
    ? Math.max(...schemas.filter((node) => node.x === requestX).map((node) => node.y + node.height)) + 40
    : laneY
  const responseY = responseColumns.length > 0
    ? Math.max(...schemas.filter((node) => node.x === responseX).map((node) => node.y + node.height)) + 40
    : laneY

  const resource = makeNode('resource', laneX, laneY, laneWidth, laneHeight, {
    name: plural,
    description: '',
    owner: '',
  })
  const endpointNodes = pairs.map(([method, path]) => makeNode(
    'endpoint',
    laneX + lanePadding,
    0,
    360,
    endpointHeight,
    { method, path, status: 'active', operation: '{}' },
  ))
  resource.app = { ...(resource.app ?? {}), groupMembers: endpointNodes.map((node) => node.id) }
  const byKey = new Map(Array.from(endpointNodes, (node) => [`${field(node, 'method')} ${field(node, 'path')}`, node]))
  const list = byKey.get(`GET ${collectionPath}`)
  const create = byKey.get(`POST ${collectionPath}`)
  const get = byKey.get(`GET ${itemPath}`)
  const update = byKey.get(`PATCH ${itemPath}`)
  const remove = byKey.get(`DELETE ${itemPath}`)

  if (list) {
    const responses = {
      '200': {
        description: 'OK',
        content: { 'application/json': { schema: { $ref: `#/components/schemas/${name}List` } } },
      },
    }
    list.app = {
      ...(list.app ?? {}),
      fields: {
        ...(getEntityMeta(list)?.fields ?? {}),
        operation: json({
          summary: `List ${plural}`,
          operationId: `list${pascal(plural)}`,
          tags: [plural],
          parameters: [
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } },
            { name: 'cursor', in: 'query', schema: { type: 'string' } },
          ],
          responses: { ...responses, ...problemResponses(problem) },
        }),
      },
    }
  }
  if (create) {
    create.app = {
      ...(create.app ?? {}),
      fields: {
        ...(getEntityMeta(create)?.fields ?? {}),
        operation: json({
          summary: `Create ${singular}`,
          operationId: `create${name}`,
          tags: [plural],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: `#/components/schemas/${name}Create` } } },
          },
          responses: {
            '201': {
              description: 'Created',
              content: { 'application/json': { schema: { $ref: `#/components/schemas/${name}` } } },
            },
            ...problemResponses(problem),
          },
        }),
      },
    }
  }
  if (get) {
    get.app = {
      ...(get.app ?? {}),
      fields: {
        ...(getEntityMeta(get)?.fields ?? {}),
        operation: json({
          summary: `Get ${singular}`,
          operationId: `get${name}`,
          tags: [plural],
          parameters: [{ name: idParameter, in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': {
              description: 'OK',
              content: { 'application/json': { schema: { $ref: `#/components/schemas/${name}` } } },
            },
            ...problemResponses(problem),
          },
        }),
      },
    }
  }
  if (update) {
    update.app = {
      ...(update.app ?? {}),
      fields: {
        ...(getEntityMeta(update)?.fields ?? {}),
        operation: json({
          summary: `Update ${singular}`,
          operationId: `update${name}`,
          tags: [plural],
          parameters: [{ name: idParameter, in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: `#/components/schemas/${name}Update` } } },
          },
          responses: {
            '200': {
              description: 'OK',
              content: { 'application/json': { schema: { $ref: `#/components/schemas/${name}` } } },
            },
            ...problemResponses(problem),
          },
        }),
      },
    }
  }
  if (remove) {
    remove.app = {
      ...(remove.app ?? {}),
      fields: {
        ...(getEntityMeta(remove)?.fields ?? {}),
        operation: json({
          summary: `Delete ${singular}`,
          operationId: `delete${name}`,
          tags: [plural],
          parameters: [{ name: idParameter, in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '204': { description: 'No content' }, ...problemResponses(problem) },
        }),
      },
    }
  }

  const schema = (value: JsonObject): CanvasNode => makeNode('schema', 0, 0, 360, 300, {
    name: '',
    kind: 'api',
    version: '1.0.0',
    owner: '',
    status: 'active',
    reviewStatus: 'needs_review',
    reviewedVersion: '',
    lastReviewed: '',
    reviewIntervalDays: 90,
    source: json(value),
  })
  const model = schema({
    type: 'object',
    properties: {
      id: { type: 'string' },
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
    },
    required: ['id'],
  })
  const createSchema = schema({
    type: 'object',
    properties: { name: { type: 'string', minLength: 1 } },
    required: ['name'],
  })
  const updateSchema = schema({
    type: 'object',
    properties: { name: { type: 'string', minLength: 1 } },
  })
  const listSchema = schema({
    type: 'object',
    properties: {
      items: { type: 'array', items: { $ref: `#/components/schemas/${name}` } },
      next_cursor: { type: ['string', 'null'] },
    },
    required: ['items', 'next_cursor'],
  })
  const schemaPlan: Array<[CanvasNode, string, number, number]> = [
    [model, `${name}`, responseX, responseY],
    [listSchema, `${name}List`, responseX, responseY + 340],
    [createSchema, `${name}Create`, requestX, requestY],
    [updateSchema, `${name}Update`, requestX, requestY + 340],
  ]
  for (const [node, schemaName, x, y] of schemaPlan) {
    node.x = x
    node.y = y
    node.app = { ...(node.app ?? {}), fields: { ...(getEntityMeta(node)?.fields ?? {}), name: schemaName } }
  }
  for (const [index, node] of endpointNodes.entries()) {
    node.y = laneY + laneHeader + lanePadding + index * (endpointHeight + endpointGap)
  }

  return { nodes: [resource, ...endpointNodes, ...schemaPlan.map(([node]) => node)], errors: [] }
}
