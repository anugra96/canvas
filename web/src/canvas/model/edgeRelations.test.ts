import { describe, expect, it } from 'vitest'

import { toFlowEdge } from './adapter'
import {
  applyColorToFlowEdge,
  applyLabelToFlowEdge,
  applyRelationToFlowEdge,
  edgeFromConnection,
  reconnectFlowEdge,
  reverseFlowEdge,
} from './edgeRelations'

describe('edge relation helpers', () => {
  it('creates an edge with the selected relation metadata and label', () => {
    const edge = edgeFromConnection({
      source: 'repo-a',
      target: 'db-a',
      sourceHandle: 'right',
      targetHandle: 'left',
    }, 'depends_on')

    expect(edge).toMatchObject({
      fromNode: 'repo-a',
      fromSide: 'right',
      toNode: 'db-a',
      toSide: 'left',
      label: 'depends on',
      skyward: { relationType: 'depends_on' },
    })
  })

  it('applies a custom label without losing the relation metadata', () => {
    const edge = toFlowEdge({
      id: 'edge-a',
      fromNode: 'repo-a',
      toNode: 'db-a',
      label: 'writes to',
      skyward: { relationType: 'writes_to' },
    })

    const labeled = applyLabelToFlowEdge(edge, 'nightly snapshot')
    expect(labeled.label).toBe('nightly snapshot')
    expect(labeled.data?.raw).toMatchObject({
      label: 'nightly snapshot',
      skyward: { relationType: 'writes_to' },
    })

    const cleared = applyLabelToFlowEdge(labeled, '')
    expect(cleared.label).toBeUndefined()
    expect(cleared.data?.raw?.label).toBeUndefined()
  })

  it('applies a custom color to an edge and its markers', () => {
    const edge = toFlowEdge({
      id: 'edge-a',
      fromNode: 'repo-a',
      toNode: 'db-a',
      label: 'writes to',
    })

    const colored = applyColorToFlowEdge(edge, '2')
    expect(colored.style?.stroke).toBe('#e9973f')
    expect(colored.data?.raw?.color).toBe('2')
    expect(colored.markerEnd).toMatchObject({ color: '#e9973f' })
  })

  it('updates an existing flow edge relation', () => {
    const edge = toFlowEdge({
      id: 'edge-a',
      fromNode: 'repo-a',
      toNode: 'db-a',
      label: 'relates to',
      skyward: { relationType: 'relates_to' },
    })

    const next = applyRelationToFlowEdge(edge, 'deploys_to')
    expect(next.label).toBe('deploys to')
    expect(next.data).toMatchObject({
      label: 'deploys to',
      relationType: 'deploys_to',
      raw: { skyward: { relationType: 'deploys_to' } },
    })
  })
})


describe('reverseFlowEdge', () => {
  it('swaps endpoints, sides, and arrow ends while keeping the relation', () => {
    const edge = toFlowEdge({
      id: 'edge-a',
      fromNode: 'repo-a',
      fromSide: 'right',
      toNode: 'db-a',
      toSide: 'left',
      toEnd: 'arrow',
      label: 'writes to',
      skyward: { relationType: 'writes_to' },
    })

    const reversed = reverseFlowEdge(edge)
    expect(reversed.source).toBe('db-a')
    expect(reversed.target).toBe('repo-a')
    expect(reversed.sourceHandle).toBe('left')
    expect(reversed.targetHandle).toBe('right')
    expect(reversed.data?.raw).toMatchObject({
      fromNode: 'db-a',
      toNode: 'repo-a',
      fromSide: 'left',
      toSide: 'right',
      fromEnd: 'arrow',
      skyward: { relationType: 'writes_to' },
    })
    expect(reversed.markerStart).toBeTruthy()
    expect(reversed.markerEnd).toBeUndefined()
  })
})


describe('reconnectFlowEdge', () => {
  it('reconnects an endpoint to a new card and side', () => {
    const edge = toFlowEdge({
      id: 'edge-a',
      fromNode: 'repo-a',
      fromSide: 'right',
      toNode: 'db-a',
      toSide: 'left',
      label: 'writes to',
      skyward: { relationType: 'writes_to' },
    })

    const reconnected = reconnectFlowEdge(edge, {
      source: 'repo-a',
      target: 'db-b',
      sourceHandle: 'bottom',
      targetHandle: 'top',
    })
    expect(reconnected.source).toBe('repo-a')
    expect(reconnected.target).toBe('db-b')
    expect(reconnected.sourceHandle).toBe('bottom')
    expect(reconnected.targetHandle).toBe('top')
    expect(reconnected.data?.raw).toMatchObject({
      fromNode: 'repo-a',
      toNode: 'db-b',
      fromSide: 'bottom',
      toSide: 'top',
      label: 'writes to',
      skyward: { relationType: 'writes_to' },
    })
  })
})
