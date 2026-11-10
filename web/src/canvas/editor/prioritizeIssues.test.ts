import { describe, expect, it } from 'vitest'

import type { CanvasProfileIssue } from '@canvas/contract'

import { toFlowEdge, toFlowNode } from '../model/adapter'
import { prioritizeValidationIssues } from './prioritizeIssues'

function node(id: string, entityType: string) {
  return toFlowNode({
    id,
    type: 'text',
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    text: id,
    app: { entityType, fields: { name: id } },
  })
}

function issue(code: CanvasProfileIssue['code'], reason: string, nodeId?: string): CanvasProfileIssue {
  return { code, severity: code === 'schema_invalid' ? 'error' : 'warning', message: reason, nodeId }
}

describe('prioritizeValidationIssues', () => {
  it('puts errors first, then orders warnings by connection count', () => {
    const nodes = [node('hub', 'system'), node('left', 'system'), node('right', 'system'), node('leaf', 'system'), node('note', 'note')]
    const edges = [
      toFlowEdge({ id: 'one', fromNode: 'hub', toNode: 'left' }),
      toFlowEdge({ id: 'two', fromNode: 'hub', toNode: 'right' }),
      toFlowEdge({ id: 'three', fromNode: 'hub', toNode: 'note' }),
    ]
    const prioritized = prioritizeValidationIssues([
      issue('schema_unlinked', 'leaf', 'leaf'),
      issue('schema_review', 'hub', 'hub'),
      issue('schema_invalid', 'error', 'leaf'),
    ], nodes, edges)
    expect(prioritized.map((entry) => entry.issue.message)).toEqual(['error', 'hub', 'leaf'])
    expect(prioritized[1]?.connections).toBe(3)
  })
})
