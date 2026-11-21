import { describe, expect, it } from 'vitest'

import {
  getGroupMembers,
  planLayout,
  type CanvasEdge,
  type CanvasNode,
  type GroupResize,
  type JsonCanvas,
  type LayoutPlan,
  type LayoutScope,
  type Sizes,
} from '../index'

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

function card(id: string, x: number, y: number, width = 120, height = 60): CanvasNode {
  return { id, type: 'text', x, y, width, height, text: id } as CanvasNode
}

function group(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  members?: string[],
): CanvasNode {
  return {
    id,
    type: 'group',
    x,
    y,
    width,
    height,
    label: id,
    ...(members ? { app: { groupMembers: members } } : {}),
  } as CanvasNode
}

function edge(id: string, source: string, target: string, relationType?: string): CanvasEdge {
  return {
    id,
    fromNode: source,
    toNode: target,
    ...(relationType ? { app: { relationType } } : {}),
  } as CanvasEdge
}

function rect(node: CanvasNode): Rect {
  return { x: node.x, y: node.y, width: node.width, height: node.height }
}

function contains(outer: Rect, inner: Rect): boolean {
  return inner.x >= outer.x
    && inner.y >= outer.y
    && inner.x + inner.width <= outer.x + outer.width
    && inner.y + inner.height <= outer.y + outer.height
}

function overlap(left: Rect, right: Rect): boolean {
  return left.x < right.x + right.width
    && right.x < left.x + left.width
    && left.y < right.y + right.height
    && right.y < left.y + left.height
}

function apart(left: Rect, right: Rect, gap: number): boolean {
  return left.x + left.width + gap <= right.x
    || right.x + right.width + gap <= left.x
    || left.y + left.height + gap <= right.y
    || right.y + right.height + gap <= left.y
}

function appliedNodes(canvas: JsonCanvas, plan: LayoutPlan): CanvasNode[] {
  const nodes = (canvas.nodes ?? []).map((node) => ({ ...node }))
  const byId = new Map(nodes.map((node) => [node.id, node]))
  for (const move of plan.moves) {
    const node = byId.get(move.id)
    if (node) {
      node.x = move.to.x
      node.y = move.to.y
    }
  }
  for (const resize of plan.groupResizes) {
    const node = byId.get(resize.id)
    if (!node) continue
    node.x = resize.x
    node.y = resize.y
    node.width = resize.width
    node.height = resize.height
  }
  return nodes
}

function membersOf(canvas: JsonCanvas, plan: LayoutPlan, groupNode: CanvasNode): string[] {
  const original = (canvas.nodes ?? []).find((node) => node.id === groupNode.id) ?? groupNode
  const explicit = getGroupMembers(original)
  const joined = plan.joins
    .filter((join) => join.groupId === groupNode.id)
    .map((join) => join.nodeId)
  if (explicit !== undefined) return [...new Set([...explicit, ...joined])]
  return [...new Set([
    ...(canvas.nodes ?? [])
      .filter((node) => node.type !== 'group' && contains(rect(original), {
        x: node.x + node.width / 2,
        y: node.y + node.height / 2,
        width: 0,
        height: 0,
      }))
      .map((node) => node.id),
    ...joined,
  ])]
}

function resizeOf(plan: LayoutPlan, groupId: string): GroupResize | undefined {
  return plan.groupResizes.find((resize) => resize.id === groupId)
}

interface PlanCase {
  name: string
  canvas: JsonCanvas
  scope: LayoutScope
  sizes?: Sizes
  check: (plan: LayoutPlan, applied: CanvasNode[]) => void
}

const cases: PlanCase[] = [
  {
    name: 'place moves only the listed card',
    canvas: {
      nodes: [card('a', 0, 0), card('b', 700, 0), card('c', 900, 900)],
      edges: [edge('a-c', 'a', 'c', 'uses')],
    },
    scope: { kind: 'place', nodeIds: ['c'] },
    check: (plan) => {
      expect(plan.moves.map((move) => move.id)).toEqual(['c'])
      expect(plan.joins).toEqual([])
    },
  },
  ...([
    { side: 'right of the card it points from', from: 'a', to: 'c', at: { x: 190, y: -25 } },
    { side: 'left of the card it points to', from: 'c', to: 'a', at: { x: -290, y: -25 } },
  ]).map(({ side, from, to, at }): PlanCase => ({
    name: `place lands level with its connected card, ${side}`,
    canvas: {
      nodes: [card('a', 0, 0), card('c', 900, 900, 200, 100)],
      edges: [edge('link', from, to, 'uses')],
    },
    scope: { kind: 'place', nodeIds: ['c'] },
    sizes: {
      a: { width: 100, height: 50 },
      c: { width: 200, height: 100 },
    },
    check: (_plan, applied) => {
      const placed = applied.find((node) => node.id === 'c')!
      expect({ x: placed.x, y: placed.y }).toEqual(at)
    },
  })),
  {
    name: 'place joins a shared group and stays inside it',
    canvas: {
      nodes: [
        group('g', 0, 0, 500, 320, ['a', 'b']),
        card('a', 40, 60),
        card('b', 260, 60),
        card('c', 900, 900),
      ],
      edges: [edge('a-c', 'a', 'c', 'uses')],
    },
    scope: { kind: 'place', nodeIds: ['c'] },
    check: (plan, applied) => {
      expect(plan.joins).toEqual([{ groupId: 'g', nodeId: 'c' }])
      const groupNode = applied.find((node) => node.id === 'g')!
      const placed = applied.find((node) => node.id === 'c')!
      expect(contains(rect(groupNode), rect(placed))).toBe(true)
      expect(resizeOf(plan, 'g')).toBeUndefined()
    },
  },
  {
    name: 'place stays outside groups when connections do not share one',
    canvas: {
      nodes: [
        group('g1', 0, 0, 320, 240, ['a']),
        group('g2', 600, 0, 320, 240, ['b']),
        card('a', 40, 60),
        card('b', 640, 60),
        card('c', 900, 900),
      ],
      edges: [edge('a-c', 'a', 'c', 'uses'), edge('b-c', 'b', 'c', 'uses')],
    },
    scope: { kind: 'place', nodeIds: ['c'] },
    check: (plan, applied) => {
      expect(plan.joins).toEqual([])
      const placed = applied.find((node) => node.id === 'c')!
      for (const groupNode of applied.filter((node) => node.type === 'group')) {
        expect(overlap(rect(groupNode), rect(placed))).toBe(false)
      }
    },
  },
  {
    name: 'replan keeps a card that overflows its raw group edge inside the group',
    canvas: {
      nodes: [group('g', 0, 0, 200, 400), card('a', 40, 60, 120, 60), card('wide', 40, 200, 260, 60), card('out', 600, 0)],
      edges: [edge('a-wide', 'a', 'wide', 'uses')],
    },
    scope: { kind: 'replan' },
    check: (_plan, applied) => {
      const groupNode = applied.find((node) => node.id === 'g')!
      for (const id of ['a', 'wide']) {
        expect(contains(rect(groupNode), rect(applied.find((node) => node.id === id)!))).toBe(true)
      }
      expect(overlap(rect(groupNode), rect(applied.find((node) => node.id === 'out')!))).toBe(false)
    },
  },
  {
    name: 'place uses the base point for an unconnected card',
    canvas: {
      nodes: [card('a', 0, 0), card('c', 900, 900)],
    },
    scope: { kind: 'place', nodeIds: ['c'], base: { x: 500, y: 300 } },
    check: (_plan, applied) => {
      const placed = applied.find((node) => node.id === 'c')!
      expect({ x: placed.x, y: placed.y }).toEqual({ x: 500, y: 300 })
    },
  },
  {
    name: 'replan keeps every member inside its group bounds',
    canvas: {
      nodes: [
        group('g', 0, 0, 520, 320, ['a', 'b']),
        card('a', 40, 60),
        card('b', 260, 60),
        card('c', 900, 0),
      ],
      edges: [edge('a-b', 'a', 'b', 'uses')],
    },
    scope: { kind: 'replan' },
    check: (plan, applied) => {
      expect(resizeOf(plan, 'g')).toBeTruthy()
      const groupNode = applied.find((node) => node.id === 'g')!
      for (const id of ['a', 'b']) {
        const member = applied.find((node) => node.id === id)!
        expect(contains(rect(groupNode), rect(member))).toBe(true)
      }
    },
  },
  {
    name: 'replan puts the source of a flow edge left of its target inside a group',
    canvas: {
      nodes: [
        group('g', 0, 0, 600, 320, ['a', 'b']),
        card('a', 400, 60),
        card('b', 40, 60),
      ],
      edges: [edge('a-b', 'a', 'b', 'uses')],
    },
    scope: { kind: 'replan' },
    check: (_plan, applied) => {
      const source = applied.find((node) => node.id === 'a')!
      const target = applied.find((node) => node.id === 'b')!
      expect(source.x).toBeLessThan(target.x)
    },
  },
  {
    name: 'replan keeps a raw group without groupMembers around its cards',
    canvas: {
      nodes: [
        group('g', 0, 0, 520, 320),
        card('a', 40, 60),
        card('b', 260, 60),
        card('c', 900, 0),
      ],
      edges: [edge('a-b', 'a', 'b', 'uses')],
    },
    scope: { kind: 'replan' },
    check: (plan, applied) => {
      const groupNode = applied.find((node) => node.id === 'g')!
      const resized = resizeOf(plan, 'g')
      expect(resized).toBeTruthy()
      expect(rect(groupNode)).toEqual({
        x: resized!.x,
        y: resized!.y,
        width: resized!.width,
        height: resized!.height,
      })
      for (const id of ['a', 'b']) {
        const member = applied.find((node) => node.id === id)!
        expect(contains(rect(groupNode), rect(member))).toBe(true)
      }
    },
  },
]

describe('planLayout', () => {
  it.each(cases)('$name', ({ canvas, scope, sizes, check }) => {
    const plan = planLayout(canvas, scope, sizes)
    expect(planLayout(canvas, scope, sizes)).toEqual(plan)

    const nodes = canvas.nodes ?? []
    const originalById = new Map(nodes.map((node) => [node.id, node]))
    const movedIds = new Set(plan.moves.map((move) => move.id))
    expect(movedIds.size).toBe(plan.moves.length)
    for (const move of plan.moves) {
      const original = originalById.get(move.id)
      expect(original).toBeTruthy()
      expect(move.from).toEqual({ x: original!.x, y: original!.y })
      expect(move.to).not.toEqual(move.from)
      if (scope.kind === 'place') expect(scope.nodeIds).toContain(move.id)
    }

    const applied = appliedNodes(canvas, plan)
    const cards = applied.filter((node) => node.type !== 'group')
    for (let leftIndex = 0; leftIndex < cards.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < cards.length; rightIndex += 1) {
        expect(apart(rect(cards[leftIndex]!), rect(cards[rightIndex]!), 24)).toBe(true)
      }
    }

    for (const groupNode of applied.filter((node) => node.type === 'group')) {
      const members = new Set(membersOf(canvas, plan, groupNode))
      for (const cardNode of cards) {
        if (!members.has(cardNode.id)) {
          expect(overlap(rect(groupNode), rect(cardNode))).toBe(false)
        } else {
          expect(contains(rect(groupNode), rect(cardNode))).toBe(true)
        }
      }
    }

    for (const node of nodes.filter((candidate) => candidate.type !== 'group' && !movedIds.has(candidate.id))) {
      const appliedNode = applied.find((candidate) => candidate.id === node.id)!
      expect({ x: appliedNode.x, y: appliedNode.y }).toEqual({ x: node.x, y: node.y })
    }

    check(plan, applied)
  })
})
