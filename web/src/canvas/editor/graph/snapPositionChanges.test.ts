import type { NodeChange } from '@xyflow/react'
import { describe, expect, it } from 'vitest'

import type { CanvasNode } from '@canvas/contract'

import { toFlowNode, type CanvasFlowNode } from '../../model/adapter'
import { snapPositionChanges } from './snapPositionChanges'

function node(
  id: string,
  x: number,
  y: number,
  options: { type?: 'text' | 'group'; width?: number; height?: number } = {},
): CanvasFlowNode {
  return toFlowNode({
    id,
    type: options.type ?? 'text',
    x,
    y,
    width: options.width ?? 100,
    height: options.height ?? 50,
    ...(options.type === 'group'
      ? { label: id }
      : { text: id }),
  } as CanvasNode)
}

function positionChange(id: string, x: number, y: number): NodeChange<CanvasFlowNode> {
  return { id, type: 'position', position: { x, y }, dragging: true }
}

describe('snapPositionChanges', () => {
  it.each([
    {
      name: 'returns non-position changes unchanged',
      changes: [] as NodeChange<CanvasFlowNode>[],
      nodes: [node('a', 0, 0)],
      expected: {},
    },
    {
      name: 'does not snap a moving group',
      changes: [positionChange('group', 100, 0)],
      nodes: [
        node('group', 0, 0, { type: 'group', width: 300, height: 300 }),
        node('other', 106, 300),
      ],
      expected: { group: { x: 100, y: 0 } },
    },
    {
      name: 'snaps a near card edge',
      changes: [positionChange('moving', 0, 0)],
      nodes: [node('moving', 0, 0), node('other', 106, 300)],
      expected: { moving: { x: 6, y: 0 } },
    },
    {
      name: 'leaves a far card unchanged',
      changes: [positionChange('moving', 0, 0)],
      nodes: [node('moving', 0, 0), node('other', 200, 300)],
      expected: { moving: { x: 0, y: 0 } },
    },
  ])('$name', ({ changes, nodes, expected }) => {
    const result = snapPositionChanges(changes, nodes, 1)
    const positions = Object.fromEntries(
      result.changes
        .filter((change): change is Extract<NodeChange<CanvasFlowNode>, { type: 'position' }> =>
          change.type === 'position' && Boolean(change.position))
        .map((change) => [change.id, change.position]),
    )
    expect(positions).toEqual(expected)
  })
})
