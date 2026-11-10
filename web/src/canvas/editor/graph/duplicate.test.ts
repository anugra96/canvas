import { describe, expect, it } from 'vitest'

import type { CanvasEdge, CanvasNode } from '@canvas/contract'

import { toFlowEdge, toFlowNode, type CanvasFlowEdge, type CanvasFlowNode } from '../../model/adapter'
import { duplicateSelection } from './duplicate'

function node(
  id: string,
  options: { selected?: boolean; groupMembers?: string[] } = {},
): CanvasFlowNode {
  const raw = options.groupMembers
    ? {
      id,
      type: 'group',
      x: 0,
      y: 0,
      width: 300,
      height: 300,
      label: id,
      app: { groupMembers: options.groupMembers },
    }
    : { id, type: 'text', x: 0, y: 0, width: 100, height: 50, text: id }
  return { ...toFlowNode(raw as CanvasNode), selected: options.selected }
}

function edge(source: string, target: string, selected = false): CanvasFlowEdge {
  return {
    ...toFlowEdge({
      id: `edge-${source}-${target}`,
      fromNode: source,
      toNode: target,
    } as CanvasEdge),
    selected,
  }
}

function ids(...values: string[]): () => string {
  let index = 0
  return () => values[index++] ?? `extra-${index}`
}

describe('duplicateSelection', () => {
  it.each([
    {
      name: 'clones a selected card and its selected edge',
      nodes: [node('a', { selected: true }), node('b')],
      edges: [edge('a', 'b', true)],
      createId: ids('clone-a', 'clone-edge'),
      expected: {
        nodes: [{ id: 'clone-a', x: 40, y: 40 }],
        edges: [{ id: 'clone-edge', source: 'clone-a', target: 'b' }],
        groupMembers: undefined,
      },
    },
    {
      name: 'remaps the selected members of a group',
      nodes: [
        node('group', { selected: true, groupMembers: ['a', 'b'] }),
        node('a', { selected: true }),
        node('b'),
      ],
      edges: [],
      createId: ids('clone-group', 'clone-a'),
      expected: {
        nodes: [{ id: 'clone-group', x: 40, y: 40 }, { id: 'clone-a', x: 40, y: 40 }],
        edges: [],
        groupMembers: ['clone-a'],
      },
    },
    {
      name: 'clones an unselected edge between two selected cards',
      nodes: [node('a', { selected: true }), node('b', { selected: true })],
      edges: [edge('a', 'b')],
      createId: ids('clone-a', 'clone-b', 'clone-edge'),
      expected: {
        nodes: [{ id: 'clone-a', x: 40, y: 40 }, { id: 'clone-b', x: 40, y: 40 }],
        edges: [{ id: 'clone-edge', source: 'clone-a', target: 'clone-b' }],
        groupMembers: undefined,
      },
    },
  ])('$name', ({ nodes, edges, createId, expected }) => {
    const result = duplicateSelection({ nodes, edges, createId })
    expect(result.nodes.map((item) => ({ id: item.id, x: item.position.x, y: item.position.y })))
      .toEqual(expected.nodes)
    expect(result.edges.map((item) => ({ id: item.id, source: item.source, target: item.target })))
      .toEqual(expected.edges)
    const group = result.nodes.find((item) => item.type === 'group')
    expect(group?.data.raw.type === 'group' ? group.data.raw.app?.groupMembers : undefined)
      .toEqual(expected.groupMembers)
  })
})
