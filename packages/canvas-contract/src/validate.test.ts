import { describe, expect, it } from 'vitest'

import { validateCanvas } from './validate'

describe('validateCanvas', () => {
  it('accepts a valid canvas and preserves unknown fields', () => {
    const result = validateCanvas({
      nodes: [
        {
          id: 'card-a',
          type: 'text',
          x: 0,
          y: 0,
          width: 320,
          height: 180,
          text: '# Hello',
          styleAttributes: { align: 'center' },
        },
        {
          id: 'group-a',
          type: 'group',
          x: -20,
          y: -20,
          width: 400,
          height: 260,
          label: 'Group',
        },
      ],
      edges: [
        {
          id: 'edge-a',
          fromNode: 'card-a',
          fromSide: 'right',
          toNode: 'group-a',
          toSide: 'left',
          label: 'contains',
        },
      ],
      metadata: { version: '1.0-1.0' },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.canvas.nodes?.[0]).toMatchObject({
      id: 'card-a',
      styleAttributes: { align: 'center' },
    })
    expect(result.canvas.metadata).toEqual({ version: '1.0-1.0' })
  })

  it('rejects duplicate ids across nodes and edges', () => {
    const result = validateCanvas({
      nodes: [
        { id: 'same', type: 'text', x: 0, y: 0, width: 100, height: 100, text: 'a' },
      ],
      edges: [{ id: 'same', fromNode: 'same', toNode: 'same' }],
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.join(' ')).toContain('duplicate id "same"')
  })

  it('rejects dangling edge references', () => {
    const result = validateCanvas({
      nodes: [],
      edges: [{ id: 'edge-a', fromNode: 'missing', toNode: 'missing-too' }],
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toContain('edges.edge-a: fromNode "missing" does not exist')
    expect(result.errors).toContain('edges.edge-a: toNode "missing-too" does not exist')
  })

  it('rejects non-positive node sizes', () => {
    const result = validateCanvas({
      nodes: [
        { id: 'card-a', type: 'text', x: 0, y: 0, width: 0, height: 100, text: 'a' },
      ],
    })

    expect(result.ok).toBe(false)
  })
})
