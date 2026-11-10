import type { NodeChange } from '@xyflow/react'

import { findSnap, type AlignmentGuide } from '../../model/alignment'
import { nodeDimensions, type CanvasFlowNode } from '../../model/adapter'

type PositionChange = Extract<NodeChange<CanvasFlowNode>, { type: 'position' }>

export interface SnapPositionResult {
  changes: NodeChange<CanvasFlowNode>[]
  guides: AlignmentGuide[]
}

export function snapPositionChanges(
  changes: NodeChange<CanvasFlowNode>[],
  nodes: CanvasFlowNode[],
  zoom: number,
): SnapPositionResult {
  const positionChanges = changes.filter((change): change is PositionChange =>
    change.type === 'position' && Boolean(change.position))
  if (positionChanges.length === 0) return { changes, guides: [] }

  const movingIds = new Set(positionChanges.map((change) => change.id))
  const movingNodes = nodes
    .filter((node) => movingIds.has(node.id))
    .map((node) => {
      const change = positionChanges.find((candidate) => candidate.id === node.id)
      return { ...node, position: change?.position ?? node.position }
    })

  if (movingNodes.some((node) => node.type === 'group')) {
    return { changes, guides: [] }
  }

  const others = nodes.filter((node) => !movingIds.has(node.id))
  const snap = findSnap(
    movingNodes.map((node) => {
      const size = nodeDimensions(node)
      return { id: node.id, x: node.position.x, y: node.position.y, width: size.width, height: size.height }
    }),
    others.map((node) => {
      const size = nodeDimensions(node)
      return { id: node.id, x: node.position.x, y: node.position.y, width: size.width, height: size.height }
    }),
    8 / Math.max(zoom, 0.2),
  )

  if (snap.dx === 0 && snap.dy === 0) {
    return { changes, guides: snap.guides }
  }

  return {
    changes: changes.map((change) => {
      if (change.type !== 'position' || !change.position || !movingIds.has(change.id)) {
        return change
      }
      return {
        ...change,
        position: {
          x: change.position.x + snap.dx,
          y: change.position.y + snap.dy,
        },
      }
    }),
    guides: snap.guides,
  }
}
