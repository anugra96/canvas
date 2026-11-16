import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { getEntityMeta } from '../ontology'
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
