import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import { describe, expect, it } from 'vitest'

import type { CanvasNode, JsonCanvas } from '../jsonCanvas'
import { importDatabaseSql } from './importDatabase'
import { estimateDatabaseSizes, layoutDatabaseCanvas } from './layout'
import { schemaName, stringField } from './model'

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
  })
})
