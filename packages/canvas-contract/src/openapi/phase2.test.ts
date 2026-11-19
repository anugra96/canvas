import { describe, expect, it } from 'vitest'

import { getEntityMeta } from '../ontology'
import type { CanvasNode } from '../jsonCanvas'
import { addApiEndpoint } from './addEndpoint'
import { exportOpenApiDocument, exportOpenApiCanvas, OpenApiExportError } from './exportOpenApi'
import { generateExample } from './examples'
import { importOpenApi } from './importOpenApi'
import { estimateApiSizes } from './layout'
import { deriveManagedRelations } from './managedRelations'
import { buildCurlSnippet } from './requestSnippet'
import { applyStandardErrors } from './standardErrors'

function synthetic(): CanvasNode[] {
  const imported = importOpenApi({
    openapi: '3.1.0',
    info: { title: 'Orders', version: '1.0.0' },
    tags: [{ name: 'Zulu' }, { name: 'Alpha' }],
    components: {
      schemas: { Thing: { type: 'object' } },
      securitySchemes: { BearerAuth: { type: 'http', scheme: 'bearer' } },
    },
    paths: {
      '/z': { get: { tags: ['Alpha'], responses: { '200': { description: 'OK' } } } },
      '/b': { get: { tags: ['Alpha'], responses: { '200': { description: 'OK' } } } },
      '/a': { post: { tags: ['Zulu'], responses: { '201': { description: 'OK' } } } },
    },
  })
  return imported.canvas.nodes ?? []
}

function endpoint(nodes: CanvasNode[], path: string, method: string): CanvasNode {
  const node = nodes.find((candidate) => (
    getEntityMeta(candidate)?.entityType === 'endpoint'
    && getEntityMeta(candidate)?.fields.path === path
    && getEntityMeta(candidate)?.fields.method === method
  ))
  if (!node) throw new Error(`Missing ${method} ${path}`)
  return node
}

describe('Phase 2 API tools', () => {
  it('exports paths in lane order and refuses every invalid JSON source', () => {
    const nodes = synthetic()
    const exported = exportOpenApiDocument({ nodes, edges: [] })
    expect(Object.keys(exported.paths as Record<string, unknown>)).toEqual(['/a', '/b', '/z'])

    const broken = structuredClone(nodes)
    const api = broken.find((node) => getEntityMeta(node)?.entityType === 'api_definition')!
    const schema = broken.find((node) => getEntityMeta(node)?.entityType === 'schema')!
    const security = broken.find((node) => getEntityMeta(node)?.entityType === 'security_scheme')!
    const operation = endpoint(broken, '/a', 'POST')
    api.app = { ...(api.app ?? {}), fields: { ...(getEntityMeta(api)?.fields ?? {}), extra: '{' } }
    schema.app = { ...(schema.app ?? {}), fields: { ...(getEntityMeta(schema)?.fields ?? {}), source: '[' } }
    security.app = { ...(security.app ?? {}), fields: { ...(getEntityMeta(security)?.fields ?? {}), type: 'oauth2', definition: 'bad', flows: '{' } }
    operation.app = { ...(operation.app ?? {}), fields: { ...(getEntityMeta(operation)?.fields ?? {}), operation: 'op' } }

    expect(() => exportOpenApiDocument({ nodes: broken, edges: [] })).toThrow(OpenApiExportError)
    try {
      exportOpenApiDocument({ nodes: broken, edges: [] })
    } catch (cause) {
      expect(cause).toBeInstanceOf(OpenApiExportError)
      expect((cause as OpenApiExportError).issues.map((issue) => issue.field)).toEqual([
        'extra', 'operation', 'source', 'definition', 'flows',
      ])
      expect((cause as OpenApiExportError).issues.map((issue) => issue.label)).toEqual([
        'Orders', '/a', 'Thing', 'BearerAuth', 'BearerAuth',
      ])
    }
  })

  it('adds an endpoint to an existing resource with its tag, lane, and managed line', () => {
    const imported = importOpenApi({
      openapi: '3.1.0',
      info: { title: 'Tasks', version: '1.0.0' },
      tags: [{ name: 'tasks' }],
      paths: {
        '/tasks': { get: { tags: ['tasks'], responses: { '200': { description: 'OK' } } } },
      },
    })
    const canvas = imported.canvas
    const resource = (canvas.nodes ?? []).find((node) => getEntityMeta(node)?.entityType === 'resource')!
    const result = addApiEndpoint(canvas, {
      resourceId: resource.id,
      method: 'get',
      path: '/tasks/{task_id}/history',
      summary: 'Task history',
    }, estimateApiSizes(canvas))
    expect(result.errors).toEqual([])
    const endpoint = result.nodes.find((node) => node.id === result.endpointId)!
    expect(getEntityMeta(endpoint)?.fields).toMatchObject({
      method: 'GET',
      path: '/tasks/{task_id}/history',
    })
    expect(JSON.parse(String(getEntityMeta(endpoint)?.fields.operation))).toEqual({
      summary: 'Task history',
      tags: ['tasks'],
    })
    const lane = result.nodes.find((node) => node.id === resource.id)!
    expect(endpoint.x).toBeGreaterThanOrEqual(lane.x)
    expect(endpoint.x + endpoint.width).toBeLessThanOrEqual(lane.x + lane.width)
    expect(endpoint.y).toBeGreaterThanOrEqual(lane.y)
    expect(endpoint.y + endpoint.height).toBeLessThanOrEqual(lane.y + lane.height)
    expect(lane.app?.groupMembers).toContain(endpoint.id)
    expect(deriveManagedRelations({ nodes: result.nodes, edges: [] })).toContainEqual(
      expect.objectContaining({
        fromNode: resource.id,
        toNode: endpoint.id,
        app: expect.objectContaining({ relationType: 'contains', managed: true }),
      }),
    )
    const exported = exportOpenApiCanvas({ nodes: result.nodes, edges: [] })
    expect(exported.paths).toMatchObject({
      '/tasks/{task_id}/history': {
        get: { summary: 'Task history', tags: ['tasks'] },
      },
    })
  })

  it('adds standard errors only to response classes that are missing', () => {
    const imported = importOpenApi({
      openapi: '3.1.0',
      info: { title: 'Things', version: '1.0.0' },
      paths: {
        '/things': {
          get: { responses: { '200': { description: 'OK' }, '404': { description: 'Missing' } } },
          post: { responses: { '201': { description: 'Created' } } },
        },
      },
    })
    const nodes = imported.canvas.nodes ?? []
    const get = endpoint(nodes, '/things', 'GET')
    const post = endpoint(nodes, '/things', 'POST')
    const before = {
      get: JSON.parse(String(getEntityMeta(get)?.fields.operation)),
      post: JSON.parse(String(getEntityMeta(post)?.fields.operation)),
    }
    const result = applyStandardErrors({ nodes, edges: [] }, [get.id, post.id])
    expect(result.errors).toEqual([])
    expect(result.added).toBe(3)
    const updatedGet = JSON.parse(String(getEntityMeta(result.nodes.find((node) => node.id === get.id)!)?.fields.operation))
    const updatedPost = JSON.parse(String(getEntityMeta(result.nodes.find((node) => node.id === post.id)!)?.fields.operation))
    expect(updatedGet.responses['200']).toEqual(before.get.responses['200'])
    expect(updatedGet.responses['404']).toEqual(before.get.responses['404'])
    expect(updatedGet.responses['4XX']).toBeUndefined()
    expect(updatedGet.responses['5XX'].content['application/problem+json'].schema.$ref).toBe('#/components/schemas/Problem')
    expect(updatedPost.responses['201']).toEqual(before.post.responses['201'])
    expect(updatedPost.responses['4XX']).toBeDefined()
    expect(result.nodes.filter((node) => getEntityMeta(node)?.fields.name === 'Problem')).toHaveLength(1)
  })

  it('generates deterministic examples from schema keywords', () => {
    const schemas = {
      Child: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      OptionalChild: {
        type: 'object',
        properties: { id: { type: 'string' }, optional: { type: 'string' } },
        required: ['id'],
      },
    }
    const cases: Array<[unknown, unknown]> = [
      [{ const: 'fixed' }, 'fixed'],
      [{ type: 'string', enum: ['first', 'second'] }, 'first'],
      [{ type: 'string', default: 'defaulted' }, 'defaulted'],
      [{ type: 'string', format: 'date-time' }, '2024-01-01T00:00:00Z'],
      [{ type: 'string', format: 'uuid' }, '00000000-0000-4000-8000-000000000000'],
      [{ type: 'string', minLength: 10 }, 'stringxxxx'],
      [{ type: 'integer', minimum: 5 }, 5],
      [{ type: 'array', minItems: 2, items: { type: 'boolean' } }, [true, true]],
      [{ $ref: '#/components/schemas/Child' }, { id: 'string' }],
      [{ $ref: '#/components/schemas/OptionalChild' }, { id: 'string', optional: 'string' }],
      [{
        type: 'object',
        properties: { id: { type: 'string' }, optional: { type: 'string' } },
        required: ['id'],
      }, { id: 'string', optional: 'string' }],
      [{
        type: 'object',
        properties: {
          child: {
            type: 'object',
            properties: { id: { type: 'string' }, optional: { type: 'string' } },
            required: ['id'],
          },
        },
        required: ['child'],
      }, { child: { id: 'string' } }],
      [{ $ref: '#/components/schemas/Child', example: 'ignored' }, { id: 'string' }],
    ]
    for (const [schema, expected] of cases) {
      expect(generateExample(schema, schemas)).toEqual(expected)
    }
  })

  it('builds curl snippets with bearer, API key, path, query, and body', () => {
    const base = {
      method: 'POST',
      path: '/v1/projects/{project_id}',
      servers: ['https://api.example.com'],
      globalSecurity: [] as string[],
      securitySchemes: {
        BearerAuth: { type: 'http', scheme: 'bearer' },
        HeaderKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
      },
    }
    const operation = {
      parameters: [
        { name: 'project_id', in: 'path', required: true, example: 'p-1' },
        { name: 'expand', in: 'query', required: true, example: 'owner' },
        { name: 'cursor', in: 'query', required: false },
      ],
      requestBody: {
        content: { 'application/json': { example: { name: 'North' } } },
      },
    }
    const bearer = buildCurlSnippet({
      ...base,
      operation,
      globalSecurity: ['BearerAuth'],
    })
    expect(bearer).toContain("curl -X POST 'https://api.example.com/v1/projects/p-1?expand=owner'")
    expect(bearer).toContain("-H 'Authorization: Bearer $TOKEN'")
    expect(bearer).toContain("-H 'Content-Type: application/json'")
    expect(bearer).toContain('--data \'{"name":"North"}\'')

    const apiKey = buildCurlSnippet({
      ...base,
      operation: {
        ...operation,
        security: [{ HeaderKey: [] }],
        requestBody: { content: {} },
      },
      path: '/v1/projects/{project_id}',
    })
    expect(apiKey).toContain("-H 'X-API-Key: $API_KEY'")
    expect(apiKey).not.toContain('Authorization')
    expect(apiKey).not.toContain('--data')
  })
})
