import { describe, expect, it } from 'vitest'

import type { CanvasNode } from '@canvas/contract'

import { toFlowNode } from './adapter'
import { insertNodes } from './insertNodes'

function node(id: string, selected = false) {
  return {
    ...toFlowNode({
      id,
      type: 'text',
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      text: id,
    } as CanvasNode),
    selected,
  }
}

describe('insertNodes', () => {
  it.each([
    ['end', ['existing-a', 'existing-b', 'inserted']],
    ['start', ['inserted', 'existing-a', 'existing-b']],
  ] as const)('places inserted nodes at the %s and clears old selection', (placement, order) => {
    const current = [node('existing-a', true), node('existing-b')]
    const inserted = [node('inserted', true)]

    const result = insertNodes(current, inserted, placement)

    expect(result.map((item) => item.id)).toEqual(order)
    expect(result.filter((item) => item.selected).map((item) => item.id)).toEqual(['inserted'])
    expect(current[0]?.selected).toBe(true)
  })
})
