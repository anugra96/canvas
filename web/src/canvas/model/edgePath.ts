import {
  Position,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
} from '@xyflow/react'

import type { EdgeStyle } from './edgeStyle'

export interface EdgePathInput {
  id: string
  sourceX: number
  sourceY: number
  sourcePosition: Position
  targetX: number
  targetY: number
  targetPosition: Position
}

export interface EdgePathResult {
  path: string
  labelX: number
  labelY: number
}

export function getCanvasEdgePath(
  input: EdgePathInput,
  style: EdgeStyle = 'bezier',
): EdgePathResult {
  const params = {
    sourceX: input.sourceX,
    sourceY: input.sourceY,
    sourcePosition: input.sourcePosition,
    targetX: input.targetX,
    targetY: input.targetY,
    targetPosition: input.targetPosition,
  }
  const [path, labelX, labelY] = style === 'straight'
    ? getStraightPath(params)
    : style === 'step'
      ? getSmoothStepPath({ ...params, borderRadius: 0, offset: 28 })
      : style === 'smoothstep'
        ? getSmoothStepPath({ ...params, borderRadius: 16, offset: 28 })
        : getBezierPath({ ...params, curvature: 0.28 })
  return { path, labelX, labelY }
}
