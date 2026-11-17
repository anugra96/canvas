import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import { describe, expect, it } from 'vitest'

import type { CanvasEdge, CanvasNode, JsonCanvas } from '../jsonCanvas'
import { importDatabaseSql } from './importDatabase'
import { estimateDatabaseSizes, layoutDatabaseCanvas } from './layout'
import { withManagedReferences } from './managedRelations'
import { nodeTableDefinition, schemaName, stringField } from './model'

const require = createRequire(import.meta.url)
const wasm = readFileSync(require.resolve('libpg-query/wasm/libpg-query.wasm'))

const fixtures = [
  'auth-better-auth.sql',
  'order-erd.sql',
  'pg-dump-synthetic.sql',
] as const

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')
}

function typeOf(node: CanvasNode): string {
  return node.app?.entityType ?? ''
}

function rect(node: CanvasNode) {
  return {
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
  }
}

function overlaps(left: CanvasNode, right: CanvasNode): boolean {
  const a = rect(left)
  const b = rect(right)
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y
}

function positions(canvas: JsonCanvas): Record<string, { x: number; y: number; width: number; height: number }> {
  return Object.fromEntries((canvas.nodes ?? []).map((node) => [
    node.id,
    { x: node.x, y: node.y, width: node.width, height: node.height },
  ]))
}

const TABLE_HEADER = 58
const COLUMN_ROW = 26

function columnHandlePoint(node: CanvasNode, column: string, side: string | undefined) {
  const index = nodeTableDefinition(node)?.columns.findIndex((candidate) => candidate.name === column) ?? -1
  if (index < 0) throw new Error(`Missing column ${column} on ${node.id}`)
  return {
    x: side === 'left' ? node.x : node.x + node.width,
    y: node.y + TABLE_HEADER + index * COLUMN_ROW + COLUMN_ROW / 2,
  }
}

function segmentIntersectsCard(
  from: { x: number; y: number },
  to: { x: number; y: number },
  card: CanvasNode,
  inset = 0.5,
): boolean {
  const left = card.x + inset
  const right = card.x + card.width - inset
  const top = card.y + inset
  const bottom = card.y + card.height - inset
  if (right <= left || bottom <= top) return false
  const dx = to.x - from.x
  const dy = to.y - from.y
  let start = 0
  let end = 1
  const checks: Array<[number, number]> = [
    [-dx, from.x - left],
    [dx, right - from.x],
    [-dy, from.y - top],
    [dy, bottom - from.y],
  ]
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return false
      continue
    }
    const ratio = q / p
    if (p < 0) start = Math.max(start, ratio)
    else end = Math.min(end, ratio)
    if (start > end) return false
  }
  return true
}

function referenceEdges(canvas: JsonCanvas): CanvasEdge[] {
  return (canvas.edges ?? []).filter((edge) => (
    (edge.app as Record<string, unknown> | undefined)?.relationType === 'references'
  ))
}

describe('Database layout', () => {
  it.each(fixtures)('%s is deterministic, overlap-free, and keeps tables in lanes', async (name) => {
    const imported = await importDatabaseSql(fixture(name), { wasm })
    const sizes = estimateDatabaseSizes(imported.canvas)
    const first = layoutDatabaseCanvas(imported.canvas, sizes)
    const second = layoutDatabaseCanvas(imported.canvas, sizes)
    expect(positions(second)).toEqual(positions(first))

    const cards = (first.nodes ?? []).filter((node) => ['table', 'db_enum', 'database_definition'].includes(typeOf(node)))
    for (let left = 0; left < cards.length; left += 1) {
      for (let right = left + 1; right < cards.length; right += 1) {
        expect(overlaps(cards[left]!, cards[right]!), `${cards[left]!.id} overlaps ${cards[right]!.id}`).toBe(false)
      }
    }

    const lanes = (first.nodes ?? []).filter((node) => typeOf(node) === 'db_schema')
    const tables = (first.nodes ?? []).filter((node) => typeOf(node) === 'table')
    expect(tables.length).toBeGreaterThan(0)
    for (const table of tables) {
      const lane = lanes.find((candidate) => stringField(candidate, 'name') === schemaName(table))
      expect(lane, `missing lane for ${schemaName(table)}`).toBeTruthy()
      const tableRect = rect(table)
      const laneRect = rect(lane!)
      expect(tableRect.x).toBeGreaterThanOrEqual(laneRect.x)
      expect(tableRect.y).toBeGreaterThanOrEqual(laneRect.y)
      expect(tableRect.x + tableRect.width).toBeLessThanOrEqual(laneRect.x + laneRect.width)
      expect(tableRect.y + tableRect.height).toBeLessThanOrEqual(laneRect.y + laneRect.height)
    }

    for (const table of tables) {
      const parents = tables.filter((candidate) => (
        candidate.id !== table.id
        && (first.edges ?? []).some((edge) => edge.fromNode === table.id && edge.toNode === candidate.id)
      ))
      for (const parent of parents) {
        expect(parent.x, `${stringField(parent, 'name')} should be left of ${stringField(table, 'name')}`)
          .toBeLessThan(table.x)
      }
    }

    const withReferences = withManagedReferences(first)
    const references = referenceEdges(withReferences)
    expect(references.length).toBeGreaterThan(0)
    const tablesById = new Map(tables.map((table) => [table.id, table]))
    for (const edge of references) {
      const child = tablesById.get(edge.fromNode)
      const parent = tablesById.get(edge.toNode)
      expect(child, `missing child table for ${edge.id}`).toBeTruthy()
      expect(parent, `missing parent table for ${edge.id}`).toBeTruthy()
      const meta = edge.app as Record<string, unknown>
      const from = columnHandlePoint(child!, String(meta.fromColumn), edge.fromSide)
      const to = columnHandlePoint(parent!, String(meta.toColumn), edge.toSide)
      for (const card of cards) {
        if (card.id === edge.fromNode || card.id === edge.toNode) continue
        expect(
          segmentIntersectsCard(from, to, card),
          `${stringField(child!, 'name')}.${meta.fromColumn} -> ${stringField(parent!, 'name')}.${meta.toColumn} crosses ${card.id}`,
        ).toBe(false)
      }
    }
  })
})
