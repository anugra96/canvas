import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import type { CanvasNode, JsonCanvas } from '../jsonCanvas'
import { API_PROFILE, profileMetadata } from '../profile'
import { applyApiCheckFix, validateApiDesign, type ApiCheckFix } from './checks'
import { importOpenApi } from './importOpenApi'

const engine = readFileSync(new URL('./fixtures/skyward-engine-v1.json', import.meta.url), 'utf8')
const alaska = readFileSync(new URL('./fixtures/openapi-alaska.yaml', import.meta.url), 'utf8')
const registry = readFileSync(new URL('./fixtures/registry-v0.json', import.meta.url), 'utf8')
const sample = readFileSync(new URL('../../../../examples/simple-tasks-api.yaml', import.meta.url), 'utf8')

function endpointNode(id: string, method: string, path: string, operation: Record<string, unknown>): CanvasNode {
  return {
    id,
    type: 'text',
    x: 0,
    y: 0,
    width: 360,
    height: 220,
    text: '',
    app: {
      entityType: 'endpoint',
      fields: { method, path, status: 'active', operation: JSON.stringify(operation, null, 2) },
    },
  }
}

function schemaNode(id: string, name: string, source: Record<string, unknown>): CanvasNode {
  return {
    id,
    type: 'text',
    x: 0,
    y: 0,
    width: 360,
    height: 300,
    text: '',
    app: {
      entityType: 'schema',
      fields: {
        name,
        kind: 'api',
        version: '1.0.0',
        owner: '',
        status: 'active',
        reviewStatus: 'approved',
        reviewedVersion: '1.0.0',
        lastReviewed: '2026-01-01',
        reviewIntervalDays: 90,
        source: JSON.stringify(source),
      },
    },
  }
}

function canvas(
  operation: Record<string, unknown>,
  options: {
    method?: string
    path?: string
    schemas?: CanvasNode[]
    extraEndpoints?: CanvasNode[]
    extra?: Record<string, unknown>
  } = {},
): JsonCanvas {
  return {
    nodes: [
      {
        id: 'api',
        type: 'text',
        x: 0,
        y: 0,
        width: 420,
        height: 220,
        text: '',
        app: {
          entityType: 'api_definition',
          fields: { title: 'Checks', version: '1.0.0', extra: JSON.stringify(options.extra ?? {}) },
        },
      },
      endpointNode('endpoint', options.method ?? 'GET', options.path ?? '/things', operation),
      ...(options.schemas ?? []),
      ...(options.extraEndpoints ?? []),
    ],
    edges: [],
    app: profileMetadata(API_PROFILE),
  }
}

function response(schema?: Record<string, unknown>): Record<string, unknown> {
  return {
    description: 'OK',
    ...(schema ? { content: { 'application/json': { schema } } } : {}),
  }
}

const objectResponse = {
  ...response({ type: 'object', properties: { id: { type: 'string' } } }),
}

function baseOperation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tags: ['things'],
    operationId: 'getThings',
    security: [],
    responses: { '200': objectResponse, '400': { description: 'Bad request' } },
    ...overrides,
  }
}

function issuesFor(code: string, source: JsonCanvas) {
  return validateApiDesign(source).filter((issue) => issue.code === code)
}

describe('API design checks', () => {
  const rows: Array<{ code: string; passing: JsonCanvas; failing: JsonCanvas }> = [
    {
      code: 'ref_unresolved',
      passing: canvas(baseOperation({ responses: { '200': response({ $ref: '#/components/schemas/Thing' }) } }), {
        schemas: [schemaNode('thing', 'Thing', { type: 'object' })],
      }),
      failing: canvas(baseOperation({ responses: { '200': response({ $ref: '#/components/schemas/Missing' }) } })),
    },
    {
      code: 'operation_duplicate',
      passing: canvas(baseOperation()),
      failing: canvas(baseOperation(), {
        extraEndpoints: [endpointNode('duplicate', 'GET', '/things', baseOperation())],
      }),
    },
    {
      code: 'path_parameter_mismatch',
      passing: canvas(baseOperation({
        parameters: [{ name: 'thing_id', in: 'path', required: true, schema: { type: 'string' } }],
      }), { path: '/things/{thing_id}' }),
      failing: canvas(baseOperation(), { path: '/things/{thing_id}' }),
    },
    {
      code: 'response_success_missing',
      passing: canvas(baseOperation()),
      failing: canvas(baseOperation({ responses: { '400': { description: 'Bad request' } } })),
    },
    {
      code: 'mutation_errors_missing',
      passing: canvas(baseOperation({ responses: { '201': response(), '400': { description: 'Bad request' } } }), { method: 'POST' }),
      failing: canvas(baseOperation({ responses: { '201': response() } }), { method: 'PATCH' }),
    },
    {
      code: 'security_missing',
      passing: canvas(baseOperation({ security: [] })),
      failing: canvas(baseOperation({ security: undefined })),
    },
    {
      code: 'list_pagination_missing',
      passing: canvas(baseOperation({
        parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer' } }],
        responses: { '200': response({ $ref: '#/components/schemas/List' }) },
      }), { schemas: [schemaNode('list', 'List', { type: 'array', items: { type: 'string' } })] }),
      failing: canvas(baseOperation({
        responses: { '200': response({ $ref: '#/components/schemas/List' }) },
      }), { schemas: [schemaNode('list', 'List', { type: 'array', items: { type: 'string' } })] }),
    },
    {
      code: 'get_with_body',
      passing: canvas(baseOperation()),
      failing: canvas(baseOperation({ requestBody: { content: {} } })),
    },
    {
      code: 'naming_inconsistent',
      passing: canvas(baseOperation(), {
        schemas: [schemaNode('names', 'Names', {
          type: 'object',
          properties: { first_name: { type: 'string' }, last_name: { type: 'string' } },
        })],
      }),
      failing: canvas(baseOperation(), {
        schemas: [schemaNode('names', 'Names', {
          type: 'object',
          properties: {
            first_name: { type: 'string' },
            last_name: { type: 'string' },
            'bad-name': { type: 'string' },
          },
        })],
      }),
    },
    {
      code: 'schema_unused',
      passing: canvas(baseOperation({ responses: { '200': response({ $ref: '#/components/schemas/Thing' }) } }), {
        schemas: [schemaNode('thing', 'Thing', { type: 'object' })],
      }),
      failing: canvas(baseOperation({ responses: { '200': response({ $ref: '#/components/schemas/Thing' }) } }), {
        schemas: [
          schemaNode('thing', 'Thing', { type: 'object' }),
          schemaNode('unused', 'Unused', { type: 'object' }),
        ],
      }),
    },
    {
      code: 'endpoint_without_resource',
      passing: canvas(baseOperation({ tags: ['things'] })),
      failing: canvas(baseOperation({ tags: undefined })),
    },
  ]

  it.each(rows)('$code passes and fails as expected', ({ code, passing, failing }) => {
    expect(issuesFor(code, passing)).toEqual([])
    expect(issuesFor(code, failing).length).toBeGreaterThan(0)
  })

  it.each([
    {
      name: 'accepts a different style in each naming category',
      source: canvas(baseOperation({
        parameters: [
          { name: 'tenant_id', in: 'query', schema: { type: 'string' } },
          { name: 'trace_id', in: 'header', schema: { type: 'string' } },
        ],
      }), {
        path: '/v1/job-items',
        extraEndpoints: [endpointNode('item', 'GET', '/v1/job-items/{job_id}', baseOperation({
          parameters: [{ name: 'job_id', in: 'path', required: true, schema: { type: 'string' } }],
        }))],
        schemas: [schemaNode('item-schema', 'JobItem', {
          type: 'object',
          properties: { job_id: { type: 'string' }, created_at: { type: 'string' }, next_cursor: { type: 'string' } },
        })],
      }),
      expected: [],
    },
    {
      name: 'flags only the outlier in its own category',
      source: canvas(baseOperation({
        parameters: [
          { name: 'tenant_id', in: 'query', schema: { type: 'string' } },
          { name: 'trace_id', in: 'header', schema: { type: 'string' } },
        ],
      }), {
        path: '/v1/job-items',
        extraEndpoints: [endpointNode('item', 'GET', '/v1/job-items/{job_id}', baseOperation({
          parameters: [{ name: 'job_id', in: 'path', required: true, schema: { type: 'string' } }],
        }))],
        schemas: [schemaNode('item-schema', 'JobItem', {
          type: 'object',
          properties: {
            job_id: { type: 'string' },
            created_at: { type: 'string' },
            badName: { type: 'string' },
          },
        })],
      }),
      expected: [{ nodeId: 'item-schema', message: /property "badName" outside snake_case/ }],
    },
  ])('$name', ({ source, expected }) => {
    const issues = issuesFor('naming_inconsistent', source)
    expect(issues.map((issue) => ({ nodeId: issue.nodeId, message: issue.message })))
      .toEqual(expected.map((issue) => ({ nodeId: issue.nodeId, message: expect.stringMatching(issue.message) })))
  })

  it('keeps fixture errors empty and lists expected warnings', () => {
    const fixtures = [
      ['Engine', engine, { endpoint_without_resource: 6, naming_inconsistent: 1 }],
      ['Alaska', alaska, { endpoint_without_resource: 1 }],
      ['Registry', registry, {}],
      ['Simple Tasks', sample, {}],
    ] as const
    for (const [name, source, expected] of fixtures) {
      const issues = validateApiDesign(importOpenApi(source).canvas)
      expect(issues.filter((issue) => issue.severity === 'error'), name).toEqual([])
      const counts: Record<string, number> = {}
      for (const issue of issues) counts[issue.code] = (counts[issue.code] ?? 0) + 1
      expect(counts, name).toEqual(expected)
    }
  })

  it.each([
    ['missing_path_parameter', 'path_parameter_mismatch', canvas(baseOperation(), { path: '/things/{thing_id}' })],
    ['standard_errors', 'mutation_errors_missing', canvas(baseOperation({ responses: { '201': response() } }), { method: 'POST' })],
    ['pagination', 'list_pagination_missing', canvas(baseOperation({
      responses: { '200': response({ $ref: '#/components/schemas/List' }) },
    }), { schemas: [schemaNode('list', 'List', { type: 'array', items: { type: 'string' } })] })],
    ['tag', 'endpoint_without_resource', canvas(baseOperation({ tags: undefined }))],
  ] as Array<[ApiCheckFix, string, JsonCanvas]>)('removes %s', (fix, code, source) => {
    const endpoint = source.nodes?.find((node) => node.app?.entityType === 'endpoint')
    expect(issuesFor(code, source).length).toBeGreaterThan(0)
    const nodes = applyApiCheckFix(source, endpoint!.id, fix)
    expect(issuesFor(code, { ...source, nodes })).toEqual([])
  })
})
