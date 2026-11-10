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
  it('reports only artifacts without producers and processes without runners', () => {
    const issues = validateSemanticRules([
      node('artifact', 'artifact'),
      node('process', 'process'),
      node('api', 'api'),
      node('database', 'database'),
    ], [])

    expect(issues.map((issue) => issue.code)).toEqual([
      'artifact_without_producer',
      'process_without_runner',
    ])
  })

  it('accepts a produced artifact and a run process', () => {
    const issues = validateSemanticRules([
      node('system', 'system'),
      node('process', 'process'),
      node('artifact', 'artifact'),
    ], [
      edge('runs', 'system', 'process', 'runs'),
      edge('produces', 'system', 'artifact', 'produces'),
    ])

    expect(issues).toEqual([])
  })
})
