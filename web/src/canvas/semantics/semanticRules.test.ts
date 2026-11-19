import { describe, expect, it } from 'vitest'

import type { CanvasEdge, CanvasNode } from '@canvas/contract'

import { validateSemanticRules } from './semanticRules'

function node(id: string, entityType: string): CanvasNode {
  return {
    id,
    type: 'text',
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    text: id,
    app: { entityType, fields: { name: id } },
  }
}

function edge(id: string, fromNode: string, toNode: string, relationType: string): CanvasEdge {
  return { id, fromNode, toNode, app: { relationType } }
}

describe('semantic rules', () => {
  it('reports only artifacts without producers', () => {
    const issues = validateSemanticRules([
      node('artifact', 'artifact'),
      node('job', 'system'),
      node('schema', 'schema'),
    ], [])

    expect(issues.map((issue) => issue.code)).toEqual([
      'artifact_without_producer',
    ])
  })

  it('accepts a produced artifact', () => {
    const issues = validateSemanticRules([
      node('system', 'system'),
      node('artifact', 'artifact'),
    ], [
      edge('produces', 'system', 'artifact', 'produces'),
    ])

    expect(issues).toEqual([])
  })
})
