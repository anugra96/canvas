import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { getEntityMeta } from '../ontology'
import { exportOpenApiCanvas } from './exportOpenApi'
import { importOpenApi } from './importOpenApi'

const engineSource = readFileSync(new URL('./fixtures/skyward-engine-v1.json', import.meta.url), 'utf8')

function countType(nodes: ReturnType<typeof importOpenApi>['canvas']['nodes'], type: string): number {
  return (nodes ?? []).filter((node) => getEntityMeta(node)?.entityType === type).length
}

describe('OpenAPI import', () => {
  it('imports the Engine fixture into the expected API cards', () => {
    const imported = importOpenApi(engineSource)
    const nodes = imported.canvas.nodes ?? []
    expect(imported.title).toBe('Skyward Engine API')
    expect(countType(nodes, 'api_definition')).toBe(1)
    expect(countType(nodes, 'endpoint')).toBe(6)
    expect(countType(nodes, 'schema')).toBe(20)
    expect(countType(nodes, 'security_scheme')).toBe(1)
    const resources = nodes
      .filter((node) => getEntityMeta(node)?.entityType === 'resource')
      .map((node) => ({ name: String(getEntityMeta(node)?.fields.name), inferred: getEntityMeta(node)?.inferred }))
    expect(resources).toEqual([
      { name: 'healthz', inferred: true },
      { name: 'jobs', inferred: true },
      { name: 'products', inferred: true },
    ])
    expect((imported.canvas.edges ?? []).every((edge) => edge.app?.managed === true)).toBe(true)
  })

  it.each([
    {
      name: 'Swagger 2.0',
      source: { swagger: '2.0', info: { title: 'Old' }, paths: {} },
      error: 'Swagger 2.0 is not supported',
    },
    {
      name: 'unknown OpenAPI version',
      source: { openapi: '2.0.0', info: { title: 'Old' }, paths: {} },
      error: 'OpenAPI 3.1 or 3.0',
    },
    {
      name: 'empty source',
      source: '',
      error: 'Paste an OpenAPI document',
    },
  ])('refuses $name', ({ source, error }) => {
    expect(() => importOpenApi(source)).toThrow(error)
  })

  it('converts OpenAPI 3.0 schema keywords and reports the conversion', () => {
    const imported = importOpenApi({
      openapi: '3.0.3',
      info: { title: 'Legacy', version: '1.0.0' },
      paths: {},
      components: {
        schemas: {
          Legacy: {
            type: 'string',
            nullable: true,
            example: 'legacy',
            minimum: 1,
            exclusiveMinimum: true,
          },
        },
      },
    })
    const schema = (imported.canvas.nodes ?? []).find((node) => getEntityMeta(node)?.entityType === 'schema')
    const source = JSON.parse(String(getEntityMeta(schema!)?.fields.source))
    expect(source.type).toEqual(['string', 'null'])
    expect(source.examples).toEqual(['legacy'])
    expect(source.exclusiveMinimum).toBe(1)
    expect(imported.warnings[0]).toContain('Converted OpenAPI 3.0 to 3.1')
  })
})

function at(value: unknown, path: Array<string | number>): unknown {
  let current = value
  for (const key of path) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string | number, unknown>)[key]
  }
  return current
}

describe('OpenAPI 3.0 conversion positions', () => {
  it.each([
    {
      name: 'wraps nullable without a type once',
      document: {
        openapi: '3.0.3',
        info: { title: 'T', version: '1' },
        paths: {},
        components: { schemas: { A: { nullable: true, allOf: [{ $ref: '#/components/schemas/B' }] }, B: { type: 'object' } } },
      },
      assert: (exported: unknown) => {
        expect(at(exported, ['components', 'schemas', 'A', 'nullable'])).toBeUndefined()
        expect(at(exported, ['components', 'schemas', 'A', 'anyOf'])).toEqual([
          { allOf: [{ $ref: '#/components/schemas/B' }] },
          { type: 'null' },
        ])
      },
    },
    {
      name: 'converts a schema example keyword',
      document: {
        openapi: '3.0.3',
        info: { title: 'T', version: '1' },
        paths: {},
        components: { schemas: { A: { type: 'string', example: 'hello' } } },
      },
      assert: (exported: unknown) => {
        expect(at(exported, ['components', 'schemas', 'A'])).toMatchObject({ type: 'string', examples: ['hello'] })
        expect(at(exported, ['components', 'schemas', 'A', 'example'])).toBeUndefined()
      },
    },
    {
      name: 'does not touch a property named example',
      document: {
        openapi: '3.0.3',
        info: { title: 'T', version: '1' },
        paths: {},
        components: { schemas: { A: { type: 'object', properties: { example: { type: 'string' } } } } },
      },
      assert: (exported: unknown) => {
        expect(at(exported, ['components', 'schemas', 'A', 'properties'])).toEqual({ example: { type: 'string' } })
      },
    },
    {
      name: 'does not convert Media Type, Parameter, or Header examples',
      document: {
        openapi: '3.0.3',
        info: { title: 'T', version: '1' },
        paths: {
          '/a': {
            get: {
              parameters: [{ name: 'q', in: 'query', example: 'keep', schema: { type: 'string' } }],
              responses: {
                '200': {
                  description: 'ok',
                  headers: { 'x-example': { schema: { type: 'string' }, example: 'header' } },
                  content: { 'application/json': { example: { id: 1 }, schema: { type: 'object' } } },
                },
              },
            },
          },
        },
      },
      assert: (exported: unknown) => {
        const operation = at(exported, ['paths', '/a', 'get'])
        expect(at(operation, ['parameters', 0, 'example'])).toBe('keep')
        expect(at(operation, ['responses', '200', 'headers', 'x-example', 'example'])).toBe('header')
        expect(at(operation, ['responses', '200', 'content', 'application/json', 'example'])).toEqual({ id: 1 })
      },
    },
    {
      name: 'converts exclusive bounds only in schema positions',
      document: {
        openapi: '3.0.3',
        info: { title: 'T', version: '1' },
        paths: {},
        components: {
          schemas: {
            A: { type: 'number', minimum: 1, exclusiveMinimum: true, maximum: 5, exclusiveMaximum: true },
            B: { type: 'string', default: { exclusiveMinimum: true }, enum: [{ example: 'value' }] },
          },
        },
      },
      assert: (exported: unknown) => {
        expect(at(exported, ['components', 'schemas', 'A', 'exclusiveMinimum'])).toBe(1)
        expect(at(exported, ['components', 'schemas', 'A', 'exclusiveMaximum'])).toBe(5)
        expect(at(exported, ['components', 'schemas', 'B', 'default'])).toEqual({ exclusiveMinimum: true })
        expect(at(exported, ['components', 'schemas', 'B', 'enum'])).toEqual([{ example: 'value' }])
      },
    },
    {
      name: 'leaves examples inside additionalProperties values alone',
      document: {
        openapi: '3.0.3',
        info: { title: 'T', version: '1' },
        paths: {},
        components: {
          schemas: {
            A: { type: 'object', additionalProperties: { type: 'string', example: 'x' } },
          },
        },
      },
      assert: (exported: unknown) => {
        expect(at(exported, ['components', 'schemas', 'A', 'additionalProperties', 'examples'])).toEqual(['x'])
      },
    },
  ])('$name', ({ document, assert }) => {
    assert(exportOpenApiCanvas(importOpenApi(document).canvas))
  })

  it('keeps a declared tag when an untagged path infers the same name', () => {
    const exported = exportOpenApiCanvas(importOpenApi({
      openapi: '3.1.0',
      info: { title: 'T', version: '1' },
      tags: [{ name: 'jobs' }],
      paths: {
        '/v1/jobs': { get: { tags: ['jobs'], responses: {} } },
        '/v1/jobs/{id}': { get: { responses: {} } },
      },
    }).canvas)
    expect(at(exported, ['tags'])).toEqual([{ name: 'jobs' }])
  })

  it('draws returns and accepts edges for array schemas whose items are a $ref', () => {
    const imported = importOpenApi({
      openapi: '3.1.0',
      info: { title: 'T', version: '1' },
      paths: {
        '/jobs': {
          post: {
            requestBody: { content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/JobCreate' } } } } },
            responses: { '200': { description: 'ok', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Job' } } } } } },
          },
        },
      },
      components: { schemas: { Job: { type: 'object' }, JobCreate: { type: 'object' } } },
    })
    const relations = (imported.canvas.edges ?? []).map((edge) => edge.app?.relationType).filter(Boolean)
    expect(relations).toContain('accepts')
    expect(relations).toContain('returns')
  })
})
