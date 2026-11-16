import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  addApiResource,
  exportOpenApiCanvas,
  getEntityMeta,
  importOpenApi,
  withManagedRelations,
  type CanvasNode,
} from '@canvas/contract'

import { validateApiExamples, validateSchemaContracts } from '../schema/jsonSchema'

function schemaNode(id: string, name: string, source: string): CanvasNode {
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
        source,
      },
    },
  }
}

function endpointNode(id: string, example: unknown): CanvasNode {
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
      fields: {
        method: 'POST',
        path: '/things',
        status: 'active',
        operation: JSON.stringify({
          requestBody: {
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Thing' },
                example,
              },
            },
          },
          responses: { '204': { description: 'No content' } },
        }),
      },
    },
  }
}

describe('Phase 2 API web tools', () => {
  it('adds a resource that re-imports, round-trips, and has zero Review errors', () => {
    const sample = readFileSync(resolve(process.cwd(), '../examples/simple-tasks-api.yaml'), 'utf8')
    const base = importOpenApi(sample).canvas
    const added = addApiResource(base, {
      singular: 'project',
      plural: 'projects',
      pathPrefix: '/v1',
      idParameter: 'project_id',
    })
    expect(added.errors).toEqual([])
    const baseNodes = base.nodes ?? []
    for (const [index, node] of added.nodes.entries()) {
      if (getEntityMeta(node)?.entityType === 'resource') continue
      for (const other of [...baseNodes, ...added.nodes.slice(0, index)]) {
        if (getEntityMeta(other)?.entityType === 'resource') continue
        const overlaps = node.x < other.x + other.width
          && node.x + node.width > other.x
          && node.y < other.y + other.height
          && node.y + node.height > other.y
        if (overlaps) throw new Error(`${String(getEntityMeta(node)?.fields.name ?? node.id)} overlaps an existing card`)
      }
    }
    const managed = withManagedRelations({
      nodes: [...baseNodes, ...added.nodes],
      edges: [],
      app: base.app,
    })
    const exported = exportOpenApiCanvas(managed)
    expect(Object.keys(exported.paths as Record<string, unknown>)).toEqual(expect.arrayContaining([
      '/v1/projects',
      '/v1/projects/{project_id}',
    ]))

    const reimported = importOpenApi(exported).canvas
    expect(exportOpenApiCanvas(reimported)).toEqual(exported)
    const issues = [
      ...validateSchemaContracts(reimported.nodes ?? [], reimported.edges ?? [], new Date('2026-01-01'), 'api'),
      ...validateApiExamples(reimported.nodes ?? []),
    ]
    expect(issues.filter((issue) => issue.severity === 'error')).toEqual([])
    expect(reimported.nodes?.filter((node) => getEntityMeta(node)?.entityType === 'schema')).toHaveLength(10)
  })

  it('validates a media type example and reports example_invalid on the endpoint', () => {
    const schema = schemaNode('thing', 'Thing', JSON.stringify({
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    }))
    expect(validateApiExamples([schema, endpointNode('valid', { id: 'thing-1' })])).toEqual([])
    const invalid = validateApiExamples([schema, endpointNode('invalid', { id: 42 })])
    expect(invalid).toHaveLength(1)
    expect(invalid[0]).toMatchObject({
      code: 'example_invalid',
      severity: 'error',
      nodeId: 'invalid',
    })
  })
})
