import { describe, expect, it } from 'vitest'

import type { CanvasNode } from '@canvas/contract'

import { toFlowNode, type CanvasFlowNode } from '../../model/adapter'
import { findPlacementPosition } from './placement'

function node(id: string, x: number, y: number, width = 100, height = 50): CanvasFlowNode {
  return toFlowNode({ id, type: 'text', x, y, width, height, text: id } as CanvasNode)
}

describe('findPlacementPosition', () => {
  it.each([
    {
      name: 'uses the base position when the center is free and visible',
      input: { base: { x: 10, y: 20 }, width: 100, height: 50, nodes: [] },
      expected: { x: 10, y: 20, visible: true },
    },
    {
      name: 'moves left and up around an occupied center',
      input: { base: { x: 0, y: 0 }, width: 100, height: 50, nodes: [node('occupied', 0, 0)] },
      expected: { x: -124, y: -74, visible: true },
    },
    {
      name: 'reports an offscreen fallback when no visible slot exists',
      input: {
        base: { x: 500, y: 500 },
        width: 100,
        height: 50,
        nodes: [],
        bounds: { topLeft: { x: 0, y: 0 }, bottomRight: { x: 100, y: 100 } },
      },
      expected: { x: 500, y: 500, visible: false },
    },
  ])('$name', ({ input, expected }) => {
    expect(findPlacementPosition(input)).toEqual(expected)
  })
})
