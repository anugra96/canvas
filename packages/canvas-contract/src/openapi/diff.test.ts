import { describe, expect, it } from 'vitest'

import { diffOpenApi, toMarkdownChangelog } from './diff'
import type { JsonObject } from './types'

function operation(overrides: JsonObject = {}): JsonObject {
  return {
    responses: {
      '200': {
        description: 'OK',
        content: {
          'application/json': {
            schema: { type: 'object', properties: { id: { type: 'string' } } },
          },
        },
      },
    },
    ...overrides,
  }
}

function document(
  path: string | undefined,
  op: JsonObject = operation(),
  schemas: JsonObject = {},
): JsonObject {
  return {
    openapi: '3.1.0',
    info: { title: 'Diff', version: '1.0.0' },
    paths: path ? { [path]: { get: op } } : {},
    components: { schemas },
  }
}

function requestBody(properties: JsonObject, required: string[] = []): JsonObject {
  return {
    requestBody: {
      content: {
        'application/json': {
          schema: { type: 'object', properties, required },
        },
      },
    },
  }
}

describe('OpenAPI diff', () => {
  const rows: Array<{
    name: string
    base: JsonObject
    head: JsonObject
    kind: string
    group: 'breaking' | 'compatible'
    warning?: boolean
  }> = [
    { name: 'endpoint removed', base: document('/things'), head: document(undefined), kind: 'endpoint_removed', group: 'breaking' },
    { name: 'method changed', base: document('/things'), head: document('/other'), kind: 'endpoint_removed', group: 'breaking' },
    { name: 'endpoint added', base: document(undefined), head: document('/things'), kind: 'endpoint_added', group: 'compatible' },
    {
      name: 'response status removed',
      base: document('/things', operation({ responses: { '200': { description: 'OK' }, '404': { description: 'Missing' } } })),
      head: document('/things'),
      kind: 'response_status_removed',
      group: 'breaking',
    },
    {
      name: 'response property removed',
      base: document('/things', operation({
        responses: { '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } } } } } },
      })),
      head: document('/things'),
      kind: 'response_property_removed',
      group: 'breaking',
    },
    {
      name: 'response property type changed',
      base: document('/things'),
      head: document('/things', operation({
        responses: { '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'number' } } } } } } },
      })),
      kind: 'response_property_type_changed',
      group: 'breaking',
    },
    {
      name: 'response property added',
      base: document('/things'),
      head: document('/things', operation({
        responses: { '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', additionalProperties: false, properties: { id: { type: 'string' }, name: { type: 'string' } } } } } } },
      })),
      kind: 'response_property_added',
      group: 'compatible',
      warning: true,
    },
    {
      name: 'request property newly required',
      base: document('/things', operation(requestBody({ name: { type: 'string' } }))),
      head: document('/things', operation(requestBody({ name: { type: 'string' } }, ['name']))),
      kind: 'request_property_required',
      group: 'breaking',
    },
    {
      name: 'required parameter added',
      base: document('/things'),
      head: document('/things', operation({ parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string' } }] })),
      kind: 'required_parameter_added',
      group: 'breaking',
    },
    {
      name: 'optional parameter added',
      base: document('/things'),
      head: document('/things', operation({ parameters: [{ name: 'q', in: 'query', required: false, schema: { type: 'string' } }] })),
      kind: 'optional_parameter_added',
      group: 'compatible',
    },
    {
      name: 'optional request property added',
      base: document('/things', operation(requestBody({}))),
      head: document('/things', operation(requestBody({ nickname: { type: 'string' } }))),
      kind: 'request_property_optional',
      group: 'compatible',
    },
    {
      name: 'request enum removed',
      base: document('/things', operation(requestBody({ status: { type: 'string', enum: ['open', 'closed'] } }))),
      head: document('/things', operation(requestBody({ status: { type: 'string', enum: ['open'] } }))),
      kind: 'request_enum_removed',
      group: 'breaking',
    },
    {
      name: 'request enum added',
      base: document('/things', operation(requestBody({ status: { type: 'string', enum: ['open'] } }))),
      head: document('/things', operation(requestBody({ status: { type: 'string', enum: ['open', 'closed'] } }))),
      kind: 'request_enum_added',
      group: 'compatible',
    },
    {
      name: 'response enum added',
      base: document('/things', operation({
        responses: { '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string', enum: ['open'] } } } } } } },
      })),
      head: document('/things', operation({
        responses: { '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string', enum: ['open', 'closed'] } } } } } } },
      })),
      kind: 'response_enum_added',
      group: 'breaking',
      warning: true,
    },
    {
      name: 'security added to public endpoint',
      base: document('/things'),
      head: document('/things', operation({ security: [{ BearerAuth: [] }] })),
      kind: 'security_added',
      group: 'breaking',
    },
    {
      name: 'description and example changed',
      base: document('/things', operation({ description: 'Old', responses: { '200': { description: 'OK', content: { 'application/json': { example: { id: 'one' } } } } } })),
      head: document('/things', operation({ description: 'New', responses: { '200': { description: 'OK', content: { 'application/json': { example: { id: 'two' } } } } } })),
      kind: 'description_changed',
      group: 'compatible',
    },
    {
      name: 'resolves schema references',
      base: document('/things', operation({ responses: { '200': { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Thing' } } } } } }), {
        Thing: { type: 'object', properties: { id: { type: 'string' } } },
      }),
      head: document('/things', operation({
        responses: { '200': { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Thing' } } } } },
      }), {
        Thing: { type: 'object', properties: { id: { type: 'number' } } },
      }),
      kind: 'response_property_type_changed',
      group: 'breaking',
    },
  ]

  it.each(rows)('$name', ({ base, head, kind, group, warning }) => {
    const result = diffOpenApi(base, head)
    const changes = Object.values(result.endpoints).flatMap((endpoint) => endpoint[group])
    const change = changes.find((candidate) => candidate.kind === kind)
    expect(change).toBeDefined()
    if (warning !== undefined) expect(change?.warning).toBe(warning)
  })

  it('renders a grouped Markdown changelog', () => {
    const markdown = toMarkdownChangelog(diffOpenApi(
      document('/things'),
      document(undefined),
    ))
    expect(markdown).toContain('## Breaking')
    expect(markdown).toContain('### GET /things')
    expect(markdown).toContain('Endpoint GET /things removed.')
  })
})
