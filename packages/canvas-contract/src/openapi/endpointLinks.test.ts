import { describe, expect, it } from 'vitest'

import type { CanvasEdge, CanvasNode, JsonCanvas } from '../jsonCanvas'
import { canvasEndpoints, validateEndpointLinks } from './endpointLinks'

function systemNode(id: string, kind: string): CanvasNode {
  return {
    id,
    type: 'text',
    x: 0,
    y: 0,
    width: 320,
    height: 180,
    text: '',
    app: { entityType: 'system', fields: { name: id, kind } },
  }
}

function endpointNode(id: string, method: string, path: string): CanvasNode {
  return {
    id,
    type: 'text',
    x: 0,
    y: 0,
    width: 360,
    height: 180,
    text: '',
    app: { entityType: 'endpoint', fields: { method, path, status: 'active', operation: '{}' } },
  }
}

function usesEdge(endpoint?: string): CanvasEdge {
  return {
    id: 'edge',
    fromNode: 'service',
    toNode: 'api',
    app: { relationType: 'uses', ...(endpoint ? { endpoint } : {}) },
  }
}

function canvas(edge: CanvasEdge, targetKind = 'api'): JsonCanvas {
  return {
    nodes: [systemNode('service', 'service'), systemNode('api', targetKind)],
    edges: [edge],
  }
}

describe('linked API endpoints', () => {
  it('lists endpoints by path then method', () => {
    expect(canvasEndpoints({
      nodes: [
        endpointNode('a', 'POST', '/v1/jobs'),
        endpointNode('b', 'GET', '/v1/health'),
        endpointNode('c', 'GET', '/v1/jobs'),
        endpointNode('d', 'DELETE', '/v1/jobs/{job_id}'),
        endpointNode('e', 'GET', '/v1/jobs/{job_id}'),
        systemNode('service', 'service'),
      ],
    })).toEqual([
      'GET /v1/health',
      'GET /v1/jobs',
      'POST /v1/jobs',
      'DELETE /v1/jobs/{job_id}',
      'GET /v1/jobs/{job_id}',
    ])
  })

  const cases: Array<{
    name: string
    edge: CanvasEdge
    endpointLists: ReadonlyMap<string, readonly string[]>
    expected: number
    targetKind?: string
  }> = [
    {
      name: 'reports a stored endpoint that the linked canvas no longer has',
      edge: usesEdge('POST /v1/jobs'),
      endpointLists: new Map([['api', ['GET /v1/jobs']]]),
      expected: 1,
    },
    {
      name: 'accepts a stored endpoint that the linked canvas still has',
      edge: usesEdge('post /v1/jobs'),
      endpointLists: new Map([['api', ['POST /v1/jobs']]]),
      expected: 0,
    },
    {
      name: 'ignores an edge without an endpoint',
      edge: usesEdge(),
      endpointLists: new Map([['api', ['GET /v1/jobs']]]),
      expected: 0,
    },
    {
      name: 'raises nothing when the linked canvas was not loaded',
      edge: usesEdge('POST /v1/jobs'),
      endpointLists: new Map(),
      expected: 0,
    },
    {
      name: 'ignores an endpoint on a System that is not an API',
      edge: usesEdge('POST /v1/jobs'),
      endpointLists: new Map([['api', ['GET /v1/jobs']]]),
      expected: 0,
      targetKind: 'database',
    },
  ]

  it.each(cases)('$name', ({ edge, endpointLists, expected, targetKind }) => {
    const issues = validateEndpointLinks(canvas(edge, targetKind), endpointLists)
    expect(issues.map((issue) => issue.code)).toEqual(Array<string>(expected).fill('endpoint_stale'))
    if (expected > 0) expect(issues[0]?.edgeId).toBe('edge')
  })
})
