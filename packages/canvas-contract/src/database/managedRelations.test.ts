import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import { describe, expect, it } from 'vitest'

import type { CanvasEdge, CanvasNode, JsonCanvas } from '../jsonCanvas'
import { importDatabaseSql } from './importDatabase'
import {
  addReferenceToCanvas,
  deriveManagedReferences,
  removeReferenceFromCanvas,
} from './managedRelations'
import {
  nodeTableDefinition,
  schemaName,
  stringField,
  stringifyTableDefinition,
} from './model'
import type { TableDefinition } from './model'

const require = createRequire(import.meta.url)
const wasm = readFileSync(require.resolve('libpg-query/wasm/libpg-query.wasm'))
const source = readFileSync(new URL('./fixtures/order-erd.sql', import.meta.url), 'utf8')

async function imported(): Promise<JsonCanvas> {
  return (await importDatabaseSql(source, { wasm })).canvas
}

function table(canvas: JsonCanvas, name: string): CanvasNode {
  const node = (canvas.nodes ?? []).find((candidate) => (
    candidate.app?.entityType === 'table' && stringField(candidate, 'name') === name
  ))
  if (!node) throw new Error(`Missing table ${name}`)
  return node
}

function definitions(canvas: JsonCanvas): Record<string, TableDefinition | undefined> {
  return Object.fromEntries((canvas.nodes ?? [])
    .filter((node) => node.app?.entityType === 'table')
    .map((node) => [`${schemaName(node)}.${stringField(node, 'name')}`, nodeTableDefinition(node)]))
}

function setDefinition(canvas: JsonCanvas, nodeId: string, definition: TableDefinition): JsonCanvas {
  return {
    ...canvas,
    nodes: (canvas.nodes ?? []).map((node) => node.id === nodeId
      ? {
        ...node,
        app: {
          ...(node.app ?? {}),
          fields: {
            ...(node.app?.fields ?? {}),
            definition: stringifyTableDefinition(definition),
          },
        },
      }
      : node),
  }
}

function referenceSummary(canvas: JsonCanvas): string[] {
  const byId = new Map((canvas.nodes ?? []).map((node) => [node.id, node]))
  return deriveManagedReferences(canvas).map((edge) => {
    const meta = (edge.app ?? {}) as Record<string, unknown>
    const child = byId.get(edge.fromNode)
    const parent = byId.get(edge.toNode)
    return `${meta.fromColumn}->${parent ? stringField(parent, 'name') : edge.toNode}.${meta.toColumn}`
      + (child ? ` from ${stringField(child, 'name')}` : '')
  }).sort()
}

function edgeFor(canvas: JsonCanvas, fromColumn: string): CanvasEdge {
  const edge = deriveManagedReferences(canvas).find((candidate) => (
    (candidate.app as Record<string, unknown> | undefined)?.fromColumn === fromColumn
  ))
  if (!edge) throw new Error(`Missing references edge from ${fromColumn}`)
  return edge
}

describe('managed references from a Definition', () => {
  it.each([
    {
      name: 'reads every foreign key in the fixture',
      edit: (canvas: JsonCanvas) => canvas,
      expected: [
        'customer_id->customer.customer_id from order',
        'order_id->order.order_id from order_item',
      ],
    },
    {
      name: 'follows a foreign-key add',
      edit: (canvas: JsonCanvas) => {
        const order = table(canvas, 'order')
        const definition = nodeTableDefinition(order)!
        return setDefinition(canvas, order.id, {
          ...definition,
          foreignKeys: [
            ...definition.foreignKeys,
            {
              columns: ['customer_id'],
              references: { schema: 'public', table: 'customer', columns: ['email'] },
            },
          ],
        })
      },
      expected: [
        'customer_id->customer.customer_id from order',
        'customer_id->customer.email from order',
        'order_id->order.order_id from order_item',
      ],
    },
    {
      name: 'removes an edge when its foreign key is deleted',
      edit: (canvas: JsonCanvas) => {
        const item = table(canvas, 'order_item')
        const definition = nodeTableDefinition(item)!
        return setDefinition(canvas, item.id, {
          ...definition,
          foreignKeys: definition.foreignKeys.filter((foreignKey) => (
            foreignKey.references.table !== 'order'
          )),
        })
      },
      expected: ['customer_id->customer.customer_id from order'],
    },
  ])('$name', async ({ edit, expected }) => {
    expect(referenceSummary(edit(await imported()))).toEqual(expected)
  })
})

describe('managed references from a drawn edge', () => {
  it('adds a foreign key when a column edge is drawn', async () => {
    const canvas = await imported()
    const item = table(canvas, 'order_item')
    const customer = table(canvas, 'customer')
    const before = definitions(canvas)
    const next = addReferenceToCanvas(canvas, {
      fromNode: item.id,
      toNode: customer.id,
      fromColumn: 'sku',
      toColumn: 'customer_id',
    })
    const definition = nodeTableDefinition(table(next, 'order_item'))!
    expect(definition.foreignKeys).toContainEqual({
      columns: ['sku'],
      references: { schema: 'public', table: 'customer', columns: ['customer_id'] },
    })
    expect(referenceSummary(next)).toContain('sku->customer.customer_id from order_item')
    expect(definitions(next)['public.customer']).toEqual(before['public.customer'])
  })

  it('removes the foreign key when the references edge is deleted', async () => {
    const canvas = await imported()
    const baseline = definitions(canvas)
    const item = table(canvas, 'order_item')
    const customer = table(canvas, 'customer')
    const drawn = addReferenceToCanvas(canvas, {
      fromNode: item.id,
      toNode: customer.id,
      fromColumn: 'sku',
      toColumn: 'customer_id',
    })
    const removed = removeReferenceFromCanvas(drawn, edgeFor(drawn, 'sku'))
    expect(definitions(removed)).toEqual(baseline)
    expect(referenceSummary(removed)).toEqual(referenceSummary(canvas))
  })

  it('removes only the matching foreign key for a baseline edge', async () => {
    const canvas = await imported()
    const removed = removeReferenceFromCanvas(canvas, edgeFor(canvas, 'customer_id'))
    const order = nodeTableDefinition(table(removed, 'order'))!
    expect(order.foreignKeys).toEqual([])
    expect(referenceSummary(removed)).toEqual(['order_id->order.order_id from order_item'])
  })
})
