import { describe, expect, it } from 'vitest'

import type { CanvasNode } from '../jsonCanvas'
import { getEntityMeta } from '../ontology'
import { importOpenApi } from './importOpenApi'
import { deriveManagedRelations } from './managedRelations'

const source = {
  openapi: '3.1.0',
  info: { title: 'Relations API', version: '1.0.0' },
  tags: [{ name: 'Jobs' }],
  security: [{ BearerAuth: [] }],
  paths: {
    '/v1/jobs': {
      post: {
        tags: ['Jobs'],
        requestBody: {
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/JobCreate' } },
          },
        },
        responses: {
          '201': {
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/Job' } },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Job: { type: 'object', properties: { id: { type: 'string' } } },
      JobCreate: {
        type: 'object',
        properties: { job: { $ref: '#/components/schemas/Job' } },
      },
    },
    securitySchemes: {
      BearerAuth: { type: 'http', scheme: 'bearer' },
    },
  },
}

function field(node: CanvasNode, key: string): string {
  const value = getEntityMeta(node)?.fields[key]
  return value == null ? '' : String(value)
}

function label(node: CanvasNode): string {
  return field(node, 'name') || field(node, 'title') || `${field(node, 'method')} ${field(node, 'path')}`
}

function setOperation(node: CanvasNode, operation: unknown): void {
  const app = node.app as { fields?: Record<string, string> }
  if (!app.fields) throw new Error('Missing entity fields')
  app.fields.operation = JSON.stringify(operation)
}

function summarize(nodes: CanvasNode[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  return deriveManagedRelations({ nodes, edges: [] }).map((edge) => {
    const sourceLabel = byId.get(edge.fromNode)
    const targetLabel = byId.get(edge.toNode)
    const meta = edge.app as Record<string, unknown>
    return `${meta.relationType}:${sourceLabel ? label(sourceLabel) : edge.fromNode}->${targetLabel ? label(targetLabel) : edge.toNode}${meta.status ? `:${meta.status}` : ''}`
  }).sort()
}

function endpoint(nodes: CanvasNode[]): CanvasNode {
  const node = nodes.find((candidate) => getEntityMeta(candidate)?.entityType === 'endpoint')
  if (!node) throw new Error('Missing endpoint')
  return node
}

describe('managed relations', () => {
  it.each([
    {
      name: 'reads tags, request body, responses, and inherited security',
      edit: () => {},
      expected: [
        'accepts:POST /v1/jobs->JobCreate',
        'authenticates_via:Relations API->BearerAuth',
        'authenticates_via:POST /v1/jobs->BearerAuth',
        'contains:Relations API->Jobs',
        'contains:Relations API->BearerAuth',
        'contains:Jobs->POST /v1/jobs',
        'returns:POST /v1/jobs->Job:201',
        'uses:JobCreate->Job',
      ],
    },
    {
      name: 'follows a response edit',
      edit: (nodes: CanvasNode[]) => {
        const target = endpoint(nodes)
        const operation = JSON.parse(String(getEntityMeta(target)?.fields.operation))
        operation.responses = {
          '202': { content: { 'application/json': { schema: { $ref: '#/components/schemas/JobCreate' } } } },
        }
        setOperation(target, operation)
      },
      expected: [
        'accepts:POST /v1/jobs->JobCreate',
        'authenticates_via:Relations API->BearerAuth',
        'authenticates_via:POST /v1/jobs->BearerAuth',
        'contains:Relations API->Jobs',
        'contains:Relations API->BearerAuth',
        'contains:Jobs->POST /v1/jobs',
        'returns:POST /v1/jobs->JobCreate:202',
        'uses:JobCreate->Job',
      ],
    },
    {
      name: 'removes the resource edge when a tag is cleared',
      edit: (nodes: CanvasNode[]) => {
        const target = endpoint(nodes)
        const operation = JSON.parse(String(getEntityMeta(target)?.fields.operation))
        delete operation.tags
        setOperation(target, operation)
      },
      expected: [
        'accepts:POST /v1/jobs->JobCreate',
        'authenticates_via:Relations API->BearerAuth',
        'authenticates_via:POST /v1/jobs->BearerAuth',
        'contains:Relations API->Jobs',
        'contains:Relations API->BearerAuth',
        'returns:POST /v1/jobs->Job:201',
        'uses:JobCreate->Job',
      ],
    },
    {
      name: 'treats an explicit empty security list as public',
      edit: (nodes: CanvasNode[]) => {
        const target = endpoint(nodes)
        const operation = JSON.parse(String(getEntityMeta(target)?.fields.operation))
        operation.security = []
        setOperation(target, operation)
      },
      expected: [
        'accepts:POST /v1/jobs->JobCreate',
        'authenticates_via:Relations API->BearerAuth',
        'contains:Relations API->Jobs',
        'contains:Relations API->BearerAuth',
        'contains:Jobs->POST /v1/jobs',
        'returns:POST /v1/jobs->Job:201',
        'uses:JobCreate->Job',
      ],
    },
  ])('$name', ({ edit, expected }) => {
    const imported = importOpenApi(source)
    const nodes = imported.canvas.nodes ?? []
    edit(nodes)
    expect(summarize(nodes)).toEqual([...expected].sort())
  })
})
