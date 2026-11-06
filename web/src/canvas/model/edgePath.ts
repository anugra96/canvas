import { Position } from '@xyflow/react'

export interface EdgePathInput {
  id: string
  sourceX: number
  sourceY: number
  sourcePosition: Position
  targetX: number
  targetY: number
  targetPosition: Position
}

export interface EdgePoint {
  x: number
  y: number
}

export interface EdgePathResult {
  path: string
  labelX: number
  labelY: number
  control1: EdgePoint
  control2: EdgePoint
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function sideVector(position: Position, offset: number): EdgePoint {
  if (position === Position.Left) return { x: -offset, y: 0 }
  if (position === Position.Right) return { x: offset, y: 0 }
  if (position === Position.Top) return { x: 0, y: -offset }
  return { x: 0, y: offset }
}

export function getCanvasEdgePath(input: EdgePathInput): EdgePathResult {
  const dx = input.targetX - input.sourceX
  const dy = input.targetY - input.sourceY
  const distance = Math.hypot(dx, dy)
  const offset = Math.min(140, Math.max(20, distance * 0.35))
  const sourceVector = sideVector(input.sourcePosition, offset)
  const targetVector = sideVector(input.targetPosition, offset)
  const control1 = {
    x: input.sourceX + sourceVector.x,
    y: input.sourceY + sourceVector.y,
  }
  const control2 = {
    x: input.targetX + targetVector.x,
    y: input.targetY + targetVector.y,
  }

  return {
    path: `M ${round(input.sourceX)},${round(input.sourceY)} C ${round(control1.x)},${round(control1.y)} ${round(control2.x)},${round(control2.y)} ${round(input.targetX)},${round(input.targetY)}`,
    labelX: (input.sourceX + 3 * control1.x + 3 * control2.x + input.targetX) / 8,
    labelY: (input.sourceY + 3 * control1.y + 3 * control2.y + input.targetY) / 8,
    control1,
    control2,
  }
}
