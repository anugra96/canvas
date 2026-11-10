import { describe, expect, it } from 'vitest'

import type { CanvasNode } from '@canvas/contract'

import { toFlowNode, type CanvasFlowNode } from '../../model/adapter'
import { moveGroupMembers } from './moveGroupMembers'

function node(
  id: string,
  x: number,
  y: number,
  options: { type?: 'text' | 'group'; width?: number; height?: number; members?: string[] } = {},
): CanvasFlowNode {
  return toFlowNode({
    id,
    type: options.type ?? 'text',
    x,
    y,
    width: options.width ?? 100,
    height: options.height ?? 50,
    ...(options.type === 'group'
      ? { label: id, ...(options.members ? { app: { groupMembers: options.members } } : {}) }
      : { text: id }),
  } as CanvasNode)
}

describe('moveGroupMembers', () => {
  it.each([
    {
      name: 'moves explicit members by the group delta',
      current: [
        node('group', 0, 0, { type: 'group', width: 300, height: 300, members: ['a', 'b'] }),
        node('a', 10, 20),
        node('b', 30, 40),
        node('outside', 400, 400),
      ],
      next: [
        node('group', 10, 30, { type: 'group', width: 300, height: 300, members: ['a', 'b'] }),
        node('a', 10, 20),
        node('b', 30, 40),
        node('outside', 400, 400),
      ],
      changes: [{ id: 'group', position: { x: 10, y: 30 } }],
      expected: { group: { x: 10, y: 30 }, a: { x: 20, y: 50 }, b: { x: 40, y: 70 }, outside: { x: 400, y: 400 } },
    },
    {
      name: 'moves cards contained by an untyped group',
      current: [
        node('group', 0, 0, { type: 'group', width: 300, height: 300 }),
        node('inside', 50, 50),
        node('outside', 350, 350),
      ],
      next: [
        node('group', 5, 15, { type: 'group', width: 300, height: 300 }),
        node('inside', 50, 50),
        node('outside', 350, 350),
      ],
      changes: [{ id: 'group', position: { x: 5, y: 15 } }],
      expected: { group: { x: 5, y: 15 }, inside: { x: 55, y: 65 }, outside: { x: 350, y: 350 } },
    },
    {
      name: 'leaves members alone when no group moves',
      current: [node('a', 10, 20), node('b', 30, 40)],
      next: [node('a', 50, 60), node('b', 30, 40)],
      changes: [{ id: 'a', position: { x: 50, y: 60 } }],
      expected: { a: { x: 50, y: 60 }, b: { x: 30, y: 40 } },
    },
  ])('$name', ({ current, next, changes, expected }) => {
    const result = moveGroupMembers(current, next, changes)
    const positions = Object.fromEntries(result.map((item) => [item.id, item.position]))
    expect(positions).toEqual(expected)
  })
})
