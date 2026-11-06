import { describe, expect, it } from 'vitest'

import type { JsonCanvas } from './jsonCanvas'
import { mergeCanvas } from './merge'

const base: JsonCanvas = {
  nodes: [
    { id: 'a', type: 'text', x: 0, y: 0, width: 200, height: 100, text: 'A' },
    { id: 'b', type: 'text', x: 300, y: 0, width: 200, height: 100, text: 'B' },
  ],
  edges: [{ id: 'e', fromNode: 'a', toNode: 'b', label: 'links' }],
}

describe('mergeCanvas', () => {
  it('merges edits to different nodes', () => {
    const local: JsonCanvas = {
      ...base,
      nodes: [
        { ...(base.nodes?.[0] as object), text: 'A local' } as never,
        base.nodes?.[1] as never,
      ],
    }
    const remote: JsonCanvas = {
      ...base,
      nodes: [
        base.nodes?.[0] as never,
        { ...(base.nodes?.[1] as object), x: 500 } as never,
      ],
    }

    const result = mergeCanvas(base, local, remote)

    expect(result.conflicts).toHaveLength(0)
    expect(result.canvas.nodes?.[0]).toMatchObject({ id: 'a', text: 'A local' })
    expect(result.canvas.nodes?.[1]).toMatchObject({ id: 'b', x: 500 })
  })

  it('merges different fields on the same node', () => {
    const local: JsonCanvas = {
      ...base,
      nodes: [
        { ...(base.nodes?.[0] as object), x: 80 } as never,
        base.nodes?.[1] as never,
      ],
    }
    const remote: JsonCanvas = {
      ...base,
      nodes: [
        { ...(base.nodes?.[0] as object), text: 'remote text' } as never,
        base.nodes?.[1] as never,
      ],
    }

    const result = mergeCanvas(base, local, remote)

    expect(result.conflicts).toHaveLength(0)
    expect(result.canvas.nodes?.[0]).toMatchObject({
      id: 'a',
      x: 80,
      text: 'remote text',
    })
  })

  it('reports a conflict when both edit the same field', () => {
    const local: JsonCanvas = {
      ...base,
      nodes: [
        { ...(base.nodes?.[0] as object), text: 'local text' } as never,
        base.nodes?.[1] as never,
      ],
    }
    const remote: JsonCanvas = {
      ...base,
      nodes: [
        { ...(base.nodes?.[0] as object), text: 'remote text' } as never,
        base.nodes?.[1] as never,
      ],
    }

    const result = mergeCanvas(base, local, remote)

    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0]).toMatchObject({
      kind: 'node',
      id: 'a',
      reason: 'both-changed',
    })
    expect(result.canvas.nodes?.[0]).toMatchObject({ id: 'a', text: 'remote text' })
  })

  it('reports delete versus edit', () => {
    const local: JsonCanvas = {
      ...base,
      nodes: [base.nodes?.[0] as never],
      edges: [],
    }
    const remote: JsonCanvas = {
      ...base,
      nodes: [
        base.nodes?.[0] as never,
        { ...(base.nodes?.[1] as object), text: 'remote edit' } as never,
      ],
    }

    const result = mergeCanvas(base, local, remote)

    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0]).toMatchObject({
      kind: 'node',
      id: 'b',
      reason: 'delete-vs-edit',
    })
    expect(result.canvas.nodes?.some((node) => node.id === 'b')).toBe(true)
  })

  it('preserves unknown fields during a field merge', () => {
    const withStyles: JsonCanvas = {
      nodes: [
        {
          id: 'a',
          type: 'text',
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          text: 'A',
          styleAttributes: { align: 'center' },
        },
      ],
      edges: [],
    }
    const local: JsonCanvas = {
      ...withStyles,
      nodes: [
        { ...(withStyles.nodes?.[0] as object), x: 40 } as never,
      ],
    }
    const remote: JsonCanvas = {
      ...withStyles,
      nodes: [
        { ...(withStyles.nodes?.[0] as object), text: 'Remote' } as never,
      ],
    }

    const result = mergeCanvas(withStyles, local, remote)

    expect(result.conflicts).toHaveLength(0)
    expect(result.canvas.nodes?.[0]).toMatchObject({
      id: 'a',
      x: 40,
      text: 'Remote',
      styleAttributes: { align: 'center' },
    })
  })

  it('removes edges whose nodes disappear', () => {
    const local: JsonCanvas = { ...base, nodes: [base.nodes?.[1] as never] }
    const remote: JsonCanvas = { ...base, nodes: [base.nodes?.[1] as never] }

    const result = mergeCanvas(base, local, remote)

    expect(result.canvas.edges).toEqual([])
  })
})
