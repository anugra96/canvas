import { Position } from '@xyflow/react'
import { describe, expect, it } from 'vitest'

import { getCanvasEdgePath } from './edgePath'

const input = {
  id: 'edge-a',
  sourceX: 0,
  sourceY: 0,
  sourcePosition: Position.Right,
  targetX: 400,
  targetY: 200,
  targetPosition: Position.Top,
}

describe('getCanvasEdgePath', () => {
  it('supports four simple path styles', () => {
    const bezier = getCanvasEdgePath(input, 'bezier').path
    const straight = getCanvasEdgePath(input, 'straight').path
    const step = getCanvasEdgePath(input, 'step').path
    const smooth = getCanvasEdgePath(input, 'smoothstep').path

    expect(bezier).toContain('C')
    expect(straight).toBe('M 0,0L 400,200')
    expect(step).toContain('L')
    expect(smooth).toContain('Q')
    expect(new Set([bezier, straight, step, smooth]).size).toBe(4)
  })

  it('returns finite label coordinates', () => {
    for (const style of ['bezier', 'straight', 'step', 'smoothstep'] as const) {
      const result = getCanvasEdgePath(input, style)
      expect(Number.isFinite(result.labelX)).toBe(true)
      expect(Number.isFinite(result.labelY)).toBe(true)
    }
  })
})
