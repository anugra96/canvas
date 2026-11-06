import { describe, expect, it } from 'vitest'

import { findSnap } from './alignment'

const moving = [{ id: 'moving', x: 100, y: 100, width: 200, height: 100 }]

describe('findSnap', () => {
  it('snaps to another card left edge and returns a guide', () => {
    const result = findSnap(moving, [{ id: 'other', x: 106, y: 300, width: 200, height: 100 }], 8)
    expect(result.dx).toBe(6)
    expect(result.dy).toBe(0)
    expect(result.guides).toEqual([
      { axis: 'x', position: 106, start: 68, end: 432 },
    ])
  })

  it('snaps centers on both axes', () => {
    const result = findSnap(moving, [{ id: 'other', x: 104, y: 104, width: 192, height: 92 }], 8)
    expect(result.dx).toBe(0)
    expect(result.dy).toBe(0)
    expect(result.guides).toHaveLength(2)
  })

  it('does not snap beyond the threshold', () => {
    const result = findSnap(moving, [{ id: 'other', x: 140, y: 300, width: 200, height: 100 }], 8)
    expect(result.dx).toBe(0)
    expect(result.dy).toBe(0)
    expect(result.guides).toEqual([])
  })

  it('uses the union bounds for a multi-node selection', () => {
    const result = findSnap([
      { id: 'a', x: 100, y: 100, width: 100, height: 100 },
      { id: 'b', x: 250, y: 100, width: 100, height: 100 },
    ], [{ id: 'other', x: 105, y: 300, width: 300, height: 100 }], 8)
    expect(result.dx).toBe(5)
  })
})
