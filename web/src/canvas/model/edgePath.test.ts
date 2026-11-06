import { Position } from '@xyflow/react'
import { describe, expect, it } from 'vitest'

import { getCanvasEdgePath } from './edgePath'

describe('getCanvasEdgePath', () => {
  it('leaves and enters perpendicular to the connected sides', () => {
    const result = getCanvasEdgePath({
      id: 'edge-a',
      sourceX: 0,
      sourceY: 0,
      sourcePosition: Position.Right,
      targetX: 400,
      targetY: 200,
      targetPosition: Position.Top,
    })

    expect(result.control1).toEqual({ x: 140, y: 0 })
    expect(result.control2).toEqual({ x: 400, y: 60 })
    expect(result.path).toContain('C')
  })

  it('stays straight when opposite sides are aligned', () => {
    const result = getCanvasEdgePath({
      id: 'edge-b',
      sourceX: 0,
      sourceY: 100,
      sourcePosition: Position.Right,
      targetX: 800,
      targetY: 100,
      targetPosition: Position.Left,
    })

    expect(result.control1.y).toBe(100)
    expect(result.control2.y).toBe(100)
    expect(result.labelY).toBe(100)
  })

  it('curves bottom-to-bottom connections downward while staying perpendicular', () => {
    const result = getCanvasEdgePath({
      id: 'edge-c',
      sourceX: 100,
      sourceY: 100,
      sourcePosition: Position.Bottom,
      targetX: 500,
      targetY: 100,
      targetPosition: Position.Bottom,
    })

    expect(result.control1).toEqual({ x: 100, y: 240 })
    expect(result.control2).toEqual({ x: 500, y: 240 })
    expect(result.labelY).toBeGreaterThan(100)
  })

  it('keeps vertical top-to-bottom connections straight', () => {
    const result = getCanvasEdgePath({
      id: 'edge-d',
      sourceX: 100,
      sourceY: 0,
      sourcePosition: Position.Bottom,
      targetX: 100,
      targetY: 800,
      targetPosition: Position.Top,
    })

    expect(result.control1.x).toBe(100)
    expect(result.control2.x).toBe(100)
    expect(result.labelX).toBe(100)
  })
})
