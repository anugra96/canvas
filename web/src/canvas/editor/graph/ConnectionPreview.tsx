import { Position, ViewportPortal } from '@xyflow/react'

import type { CanvasNodeSide } from '@canvas/contract'

import { getCanvasEdgePath } from '../../model/edgePath'
import { nodeDimensions, type CanvasFlowNode } from '../../model/adapter'
import type { PendingConnection } from './types'

const SIDE_POSITION: Record<CanvasNodeSide, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
}

const OPPOSITE_POSITION: Record<CanvasNodeSide, Position> = {
  top: Position.Bottom,
  right: Position.Left,
  bottom: Position.Top,
  left: Position.Right,
}

export function ConnectionPreview({
  nodes,
  pending,
}: {
  nodes: CanvasFlowNode[]
  pending: PendingConnection
}) {
  const source = nodes.find((node) => node.id === pending.fromNodeId)
  if (!source) return null
  const size = nodeDimensions(source)
  const sourceX = pending.fromSide === 'left'
    ? source.position.x
    : pending.fromSide === 'right'
      ? source.position.x + size.width
      : source.position.x + size.width / 2
  const sourceY = pending.fromSide === 'top'
    ? source.position.y
    : pending.fromSide === 'bottom'
      ? source.position.y + size.height
      : source.position.y + size.height / 2
  const path = getCanvasEdgePath({
    id: 'connection-preview',
    sourceX,
    sourceY,
    sourcePosition: SIDE_POSITION[pending.fromSide],
    targetX: pending.position.x,
    targetY: pending.position.y,
    targetPosition: OPPOSITE_POSITION[pending.fromSide],
  }).path

  return (
    <ViewportPortal>
      <svg className="connection-preview" aria-hidden="true">
        <path d={path} />
        <circle cx={pending.position.x} cy={pending.position.y} r={5} />
      </svg>
    </ViewportPortal>
  )
}
