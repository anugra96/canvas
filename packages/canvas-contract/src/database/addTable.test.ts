import { describe, expect, it } from 'vitest'

import type { CanvasNode, JsonCanvas } from '../jsonCanvas'
import { addDatabaseTable, type AddDatabaseTableResult } from './addTable'
import { stringField } from './model'

function apply(canvas: JsonCanvas, result: AddDatabaseTableResult): JsonCanvas {
  const updates = new Map(result.schemaUpdates.map((node) => [node.id, node]))
  return {
    ...canvas,
    nodes: [
      ...(canvas.nodes ?? []).map((node) => updates.get(node.id) ?? node),
      ...result.nodes,
    ],
  }
}

function node(canvas: JsonCanvas, id: string): CanvasNode {
  const found = (canvas.nodes ?? []).find((candidate) => candidate.id === id)
  if (!found) throw new Error(`Missing node ${id}`)
  return found
}

function lane(canvas: JsonCanvas): CanvasNode {
  const found = (canvas.nodes ?? []).find((candidate) => candidate.app?.entityType === 'db_schema')
  if (!found) throw new Error('Missing schema lane')
  return found
}

describe('Add table placement', () => {
  it('keeps the new table inside a grown lane without moving existing cards', () => {
    let canvas: JsonCanvas = { nodes: [], edges: [] }
    canvas = apply(canvas, addDatabaseTable(canvas, {
      name: 'parent',
      schema: 'public',
      idType: 'uuid',
    }))
    const laneBefore = lane(canvas)
    const parentBefore = node(canvas, (canvas.nodes ?? []).find((candidate) => (
      candidate.app?.entityType === 'table'
    ))!.id)
    const snapshot = { ...parentBefore }

    const result = addDatabaseTable(canvas, {
      name: 'child',
      schema: 'public',
      idType: 'uuid',
    })
    const next = apply(canvas, result)
    const laneAfter = lane(next)
    const child = (result.nodes ?? []).find((candidate) => candidate.app?.entityType === 'table')
    expect(child).toBeTruthy()
    expect(result.schemaUpdates.map((candidate) => candidate.id)).toEqual([laneBefore.id])
    expect(stringField(child!, 'name')).toBe('child')

    const parentAfter = node(next, parentBefore.id)
    expect({
      x: parentAfter.x,
      y: parentAfter.y,
      width: parentAfter.width,
      height: parentAfter.height,
    }).toEqual({
      x: snapshot.x,
      y: snapshot.y,
      width: snapshot.width,
      height: snapshot.height,
    })

    expect(laneAfter.width).toBeGreaterThan(laneBefore.width)
    expect(child!.x).toBeGreaterThanOrEqual(laneAfter.x)
    expect(child!.y).toBeGreaterThanOrEqual(laneAfter.y)
    expect(child!.x + child!.width).toBeLessThanOrEqual(laneAfter.x + laneAfter.width)
    expect(child!.y + child!.height).toBeLessThanOrEqual(laneAfter.y + laneAfter.height)
  })
})
