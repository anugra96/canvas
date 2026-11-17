import type { CanvasEdge, CanvasNode, JsonCanvas } from '../jsonCanvas'
import { getEdgeMeta, getEntityMeta } from '../ontology'
import type { TableDefinition, TableForeignKey } from './model'
import {
  nodeTableDefinition,
  parseTableDefinition,
  schemaName,
  stringifyTableDefinition,
  stringField,
  tableKey,
} from './model'

export interface DatabaseReferenceConnection {
  fromNode: string
  toNode: string
  fromColumn: string
  toColumn: string
}

function nodeType(node: CanvasNode): string {
  return getEntityMeta(node)?.entityType ?? ''
}

function tableNodes(canvas: Pick<JsonCanvas, 'nodes'>): CanvasNode[] {
  return (canvas.nodes ?? []).filter((node) => nodeType(node) === 'table')
}

function foreignKeyLabel(foreignKey: TableForeignKey): string | undefined {
  if (!foreignKey.onDelete || foreignKey.onDelete === 'no_action') return undefined
  return `ON DELETE ${foreignKey.onDelete.replaceAll('_', ' ').toUpperCase()}`
}

function edgeMeta(edge: CanvasEdge): Record<string, unknown> {
  return (edge.app ?? {}) as Record<string, unknown>
}

function referenceSides(
  child: CanvasNode,
  parent: CanvasNode,
): { fromSide: 'left' | 'right'; toSide: 'left' | 'right' } {
  if (child.x >= parent.x + parent.width) return { fromSide: 'left', toSide: 'right' }
  if (child.x + child.width <= parent.x) return { fromSide: 'right', toSide: 'left' }
  return { fromSide: 'right', toSide: 'right' }
}

export function deriveManagedReferences(canvas: Pick<JsonCanvas, 'nodes'>): CanvasEdge[] {
  const tables = tableNodes(canvas)
  const byKey = new Map<string, CanvasNode>()
  for (const table of tables) {
    byKey.set(tableKey(schemaName(table), stringField(table, 'name')), table)
  }
  const edges: CanvasEdge[] = []
  for (const table of tables) {
    const definition = nodeTableDefinition(table)
    if (!definition) continue
    for (const [index, foreignKey] of definition.foreignKeys.entries()) {
      const parent = byKey.get(tableKey(foreignKey.references.schema, foreignKey.references.table))
      if (!parent) continue
      const fromColumn = foreignKey.columns[0]
      const toColumn = foreignKey.references.columns[0]
      if (!fromColumn || !toColumn) continue
      const label = foreignKeyLabel(foreignKey)
      const sides = referenceSides(table, parent)
      edges.push({
        id: `managed:references:${table.id}:${parent.id}:${index}`,
        fromNode: table.id,
        toNode: parent.id,
        ...sides,
        toEnd: 'arrow',
        ...(label ? { label } : {}),
        app: {
          relationType: 'references',
          managed: true,
          fromColumn,
          toColumn,
        },
      })
    }
  }
  return edges
}

export function withManagedReferences(canvas: JsonCanvas): JsonCanvas {
  const managed = deriveManagedReferences(canvas)
  const manual = (canvas.edges ?? []).filter((edge) => !getEdgeMeta(edge)?.managed)
  return { ...canvas, edges: [...manual, ...managed] }
}

function updateDefinition(
  canvas: JsonCanvas,
  nodeId: string,
  definition: TableDefinition,
): JsonCanvas {
  return {
    ...canvas,
    nodes: (canvas.nodes ?? []).map((node) => {
      if (node.id !== nodeId) return node
      const fields = { ...(getEntityMeta(node)?.fields ?? {}) }
      fields.definition = stringifyTableDefinition(definition)
      return {
        ...node,
        app: { ...(node.app ?? {}), fields },
      }
    }),
  }
}

export function addReferenceToCanvas(
  canvas: JsonCanvas,
  connection: DatabaseReferenceConnection,
): JsonCanvas {
  const nodes = canvas.nodes ?? []
  const child = nodes.find((node) => node.id === connection.fromNode)
  const parent = nodes.find((node) => node.id === connection.toNode)
  if (!child || !parent || nodeType(child) !== 'table' || nodeType(parent) !== 'table') return canvas
  const definition = nodeTableDefinition(child)
  if (!definition) return canvas
  if (!definition.columns.some((column) => column.name === connection.fromColumn)) return canvas
  const parentDefinition = nodeTableDefinition(parent)
  if (!parentDefinition?.columns.some((column) => column.name === connection.toColumn)) return canvas
  const reference = {
    schema: schemaName(parent),
    table: stringField(parent, 'name'),
    columns: [connection.toColumn],
  }
  const exists = definition.foreignKeys.some((foreignKey) => (
    foreignKey.columns.length === 1
    && foreignKey.columns[0] === connection.fromColumn
    && foreignKey.references.schema === reference.schema
    && foreignKey.references.table === reference.table
    && foreignKey.references.columns.length === 1
    && foreignKey.references.columns[0] === connection.toColumn
  ))
  if (exists) return canvas
  const nextDefinition: TableDefinition = {
    ...definition,
    foreignKeys: [
      ...definition.foreignKeys,
      {
        columns: [connection.fromColumn],
        references: reference,
      },
    ],
  }
  return withManagedReferences(updateDefinition(canvas, child.id, nextDefinition))
}

export function removeReferenceFromCanvas(
  canvas: JsonCanvas,
  edge: CanvasEdge,
): JsonCanvas {
  const meta = edgeMeta(edge)
  const fromColumn = typeof meta.fromColumn === 'string' ? meta.fromColumn : undefined
  const toColumn = typeof meta.toColumn === 'string' ? meta.toColumn : undefined
  const child = (canvas.nodes ?? []).find((node) => node.id === edge.fromNode)
  const parent = (canvas.nodes ?? []).find((node) => node.id === edge.toNode)
  if (!child || !parent || nodeType(child) !== 'table' || nodeType(parent) !== 'table') return canvas
  const definition = nodeTableDefinition(child)
  if (!definition) return canvas
  const reference = {
    schema: schemaName(parent),
    table: stringField(parent, 'name'),
  }
  let removed = false
  const foreignKeys = definition.foreignKeys.filter((foreignKey) => {
    if (removed) return true
    if (fromColumn && foreignKey.columns[0] !== fromColumn) return true
    if (toColumn && foreignKey.references.columns[0] !== toColumn) return true
    if (foreignKey.references.schema !== reference.schema) return true
    if (foreignKey.references.table !== reference.table) return true
    removed = true
    return false
  })
  if (!removed) return canvas
  return withManagedReferences(updateDefinition(canvas, child.id, { ...definition, foreignKeys }))
}

export function referenceDefinition(
  canvas: Pick<JsonCanvas, 'nodes'>,
  nodeId: string,
): TableDefinition | undefined {
  const node = (canvas.nodes ?? []).find((candidate) => candidate.id === nodeId)
  if (!node) return undefined
  const definition = nodeTableDefinition(node)
  return definition ? parseTableDefinition(definition) : undefined
}
