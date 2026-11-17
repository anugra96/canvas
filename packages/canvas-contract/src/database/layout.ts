import type { CanvasNode, JsonCanvas } from '../jsonCanvas'
import { getEntityMeta } from '../ontology'
import { nodeTableDefinition, schemaName, stringField, tableKey } from './model'

export interface DatabaseCardSize {
  width: number
  height: number
}

export type DatabaseSizeMap = Record<string, DatabaseCardSize>

const COLUMN_GAP = 120
const LANE_GAP = 56
const LANE_PADDING = 24
const LANE_HEADER = 52
const TABLE_GAP = 28
const ENUM_GAP = 24
const HEADER_GAP = 48
const MAX_VISIBLE_COLUMNS = 12

function nodeType(node: CanvasNode): string {
  return getEntityMeta(node)?.entityType ?? ''
}

function nodeSize(node: CanvasNode, sizes: DatabaseSizeMap): DatabaseCardSize {
  return sizes[node.id] ?? { width: node.width, height: node.height }
}

function tableHeight(node: CanvasNode): number {
  const definition = nodeTableDefinition(node)
  const columns = definition?.columns.length ?? 0
  const visible = Math.min(columns, MAX_VISIBLE_COLUMNS)
  return 58 + visible * 26 + (columns > MAX_VISIBLE_COLUMNS ? 26 : 0) + 16
}

function tableWidth(node: CanvasNode): number {
  const definition = nodeTableDefinition(node)
  const longest = Math.max(
    stringField(node, 'name').length,
    ...(definition?.columns.map((column) => column.name.length + column.type.length + 4) ?? [0]),
  )
  return Math.max(340, Math.min(520, 220 + longest * 7))
}

function enumHeight(node: CanvasNode): number {
  const values = stringField(node, 'values').split(/\r?\n/).filter((line) => line.trim())
  return Math.max(120, 72 + values.length * 20)
}

function enumWidth(node: CanvasNode): number {
  const longest = Math.max(
    stringField(node, 'name').length,
    ...stringField(node, 'values').split(/\r?\n/).map((value) => value.length),
  )
  return Math.max(240, Math.min(420, 180 + longest * 8))
}

export function estimateDatabaseSizes(canvas: JsonCanvas): DatabaseSizeMap {
  const sizes: DatabaseSizeMap = {}
  for (const node of canvas.nodes ?? []) {
    switch (nodeType(node)) {
      case 'table':
        sizes[node.id] = { width: tableWidth(node), height: tableHeight(node) }
        break
      case 'db_enum':
        sizes[node.id] = { width: enumWidth(node), height: enumHeight(node) }
        break
      case 'database_definition':
        sizes[node.id] = { width: 420, height: 280 }
        break
      case 'db_schema':
        sizes[node.id] = { width: 520, height: 320 }
        break
      default:
        sizes[node.id] = { width: node.width, height: node.height }
        break
    }
  }
  return sizes
}

interface ReferenceEdge {
  child: string
  parent: string
  nullable: boolean
}

function tableReferences(tables: CanvasNode[]): ReferenceEdge[] {
  const byKey = new Map<string, CanvasNode>()
  for (const table of tables) {
    byKey.set(tableKey(schemaName(table), stringField(table, 'name')), table)
  }
  const references: ReferenceEdge[] = []
  for (const table of tables) {
    const definition = nodeTableDefinition(table)
    if (!definition) continue
    for (const foreignKey of definition.foreignKeys) {
      const parent = byKey.get(tableKey(
        foreignKey.references.schema,
        foreignKey.references.table,
      ))
      if (!parent || parent.id === table.id) continue
      const nullable = foreignKey.columns.some((name) => (
        definition.columns.find((column) => column.name === name)?.nullable !== false
      ))
      references.push({ child: table.id, parent: parent.id, nullable })
    }
  }
  return references
}

function reaches(
  edges: ReferenceEdge[],
  from: string,
  target: string,
  seen = new Set<string>(),
): boolean {
  if (from === target) return true
  if (seen.has(from)) return false
  seen.add(from)
  return edges
    .filter((edge) => edge.child === from)
    .some((edge) => reaches(edges, edge.parent, target, seen))
}

function orderedTables(tables: CanvasNode[]): CanvasNode[] {
  return [...tables].sort((left, right) =>
    stringField(left, 'name').localeCompare(stringField(right, 'name'))
    || left.id.localeCompare(right.id))
}

function tableDepths(tables: CanvasNode[]): Map<string, number> {
  const ordered = orderedTables(tables)
  const byId = new Map(ordered.map((table) => [table.id, table]))
  const sorted = [...tables].sort((left, right) => left.id.localeCompare(right.id))
  const references = tableReferences(sorted).sort((left, right) => {
    const leftName = byId.get(left.child) ? stringField(byId.get(left.child)!, 'name') : left.child
    const rightName = byId.get(right.child) ? stringField(byId.get(right.child)!, 'name') : right.child
    return leftName.localeCompare(rightName) || left.parent.localeCompare(right.parent)
  })

  const kept: ReferenceEdge[] = []
  const nonNullable = references.filter((edge) => !edge.nullable)
  const state = new Map<string, 'visiting' | 'done'>()
  const keptNonOptional: ReferenceEdge[] = []

  const visit = (id: string) => {
    if (state.get(id) === 'done') return
    if (state.get(id) === 'visiting') return
    state.set(id, 'visiting')
    for (const edge of nonNullable.filter((candidate) => candidate.child === id)) {
      if (state.get(edge.parent) === 'visiting') continue
      keptNonOptional.push(edge)
      visit(edge.parent)
    }
    state.set(id, 'done')
  }
  for (const table of ordered) visit(table.id)
  kept.push(...keptNonOptional)

  for (const edge of references.filter((candidate) => candidate.nullable)) {
    if (reaches(kept, edge.parent, edge.child)) continue
    kept.push(edge)
  }

  const depth = new Map<string, number>()
  const compute = (id: string, seen = new Set<string>()): number => {
    const cached = depth.get(id)
    if (cached !== undefined) return cached
    if (seen.has(id)) return 0
    seen.add(id)
    const parents = kept.filter((edge) => edge.child === id)
    const value = parents.length === 0
      ? 0
      : 1 + Math.max(...parents.map((edge) => compute(edge.parent, seen)))
    depth.set(id, value)
    return value
  }
  for (const table of ordered) compute(table.id)
  return depth
}

function uniqueColumns(tables: CanvasNode[], depth: Map<string, number>): Map<number, CanvasNode[]> {
  const columns = new Map<number, CanvasNode[]>()
  for (const table of orderedTables(tables)) {
    const rank = depth.get(table.id) ?? 0
    const list = columns.get(rank) ?? []
    list.push(table)
    columns.set(rank, list)
  }
  return columns
}

function round(value: number): number {
  return Math.round(value)
}

export function layoutDatabaseCanvas(
  canvas: JsonCanvas,
  sizes: DatabaseSizeMap = {},
): JsonCanvas {
  const nodes = canvas.nodes ?? []
  const resolvedSizes: DatabaseSizeMap = { ...sizes }
  const database = nodes.find((node) => nodeType(node) === 'database_definition')
  const schemaNodes = nodes
    .filter((node) => nodeType(node) === 'db_schema')
    .sort((left, right) => stringField(left, 'name').localeCompare(stringField(right, 'name')))
  const tableNodes = nodes.filter((node) => nodeType(node) === 'table')
  const enumNodes = nodes
    .filter((node) => nodeType(node) === 'db_enum')
    .sort((left, right) =>
      schemaName(left).localeCompare(schemaName(right))
      || stringField(left, 'name').localeCompare(stringField(right, 'name')))
  const positions = new Map<string, { x: number; y: number }>()

  const databaseSize = database ? nodeSize(database, resolvedSizes) : { width: 420, height: 280 }
  let top = 0
  if (database) {
    positions.set(database.id, { x: 0, y: 0 })
    top = databaseSize.height + HEADER_GAP
  }

  let enumX = 0
  let enumHeight = 0
  for (const item of enumNodes) {
    const size = nodeSize(item, resolvedSizes)
    positions.set(item.id, { x: enumX, y: top })
    enumX += size.width + ENUM_GAP
    enumHeight = Math.max(enumHeight, size.height)
  }
  let laneY = top + (enumNodes.length > 0 ? enumHeight + HEADER_GAP : 0)

  const depth = tableDepths(tableNodes)
  const tablesBySchema = new Map<string, CanvasNode[]>()
  for (const table of tableNodes) {
    const name = schemaName(table)
    const list = tablesBySchema.get(name) ?? []
    list.push(table)
    tablesBySchema.set(name, list)
  }

  for (const schema of schemaNodes) {
    const name = stringField(schema, 'name')
    const laneTables = tablesBySchema.get(name) ?? []
    const columns = uniqueColumns(laneTables, depth)
    const ranks = [...columns.keys()].sort((left, right) => left - right)
    const widths = ranks.map((rank) => (
      (columns.get(rank) ?? []).reduce(
        (max, table) => Math.max(max, nodeSize(table, resolvedSizes).width),
        0,
      )
    ))
    const contentWidth = widths.reduce((sum, width) => sum + width, 0)
      + Math.max(0, widths.length - 1) * COLUMN_GAP
    const laneWidth = Math.max(360, LANE_PADDING * 2 + contentWidth)
    let contentHeight = 0
    let x = LANE_PADDING
    for (const [index, rank] of ranks.entries()) {
      let y = LANE_HEADER + LANE_PADDING
      for (const table of columns.get(rank) ?? []) {
        const size = nodeSize(table, resolvedSizes)
        positions.set(table.id, { x: x, y: laneY + y })
        y += size.height + TABLE_GAP
      }
      contentHeight = Math.max(contentHeight, y - TABLE_GAP - LANE_HEADER)
      x += (widths[index] ?? 0) + COLUMN_GAP
    }
    const laneHeight = Math.max(LANE_HEADER + LANE_PADDING * 2 + 26, LANE_HEADER + LANE_PADDING + contentHeight + LANE_PADDING)
    resolvedSizes[schema.id] = { width: laneWidth, height: laneHeight }
    positions.set(schema.id, { x: 0, y: laneY })
    laneY += laneHeight + LANE_GAP
  }

  const nextNodes = nodes.map((node) => {
    const position = positions.get(node.id)
    if (!position) return node
    const size = resolvedSizes[node.id]
    return {
      ...node,
      x: round(position.x),
      y: round(position.y),
      ...(size ? { width: round(size.width), height: round(size.height) } : {}),
    }
  })
  return { ...canvas, nodes: nextNodes }
}

export function placeNewDatabaseCards(
  canvas: JsonCanvas,
  additions: CanvasNode[],
  sizes: DatabaseSizeMap = {},
): CanvasNode[] {
  if (additions.length === 0) return []
  const existing = canvas.nodes ?? []
  const placed = additions.map((node) => ({ ...node }))
  const handled = new Set<string>()
  const existingSchema = existing.filter((node) => nodeType(node) === 'db_schema')
  const movedSchemas = placed.filter((node) => nodeType(node) === 'db_schema')
  const schemaNodes = [...existingSchema, ...movedSchemas]
  const tables = existing.filter((node) => nodeType(node) === 'table')
  const enums = existing.filter((node) => nodeType(node) === 'db_enum')
  const existingBottom = Math.max(
    0,
    ...existing.map((node) => node.y + nodeSize(node, sizes).height),
  )
  const existingRight = Math.max(
    0,
    ...existing.map((node) => node.x + nodeSize(node, sizes).width),
  )

  for (const node of movedSchemas) {
    const size = sizes[node.id] ?? { width: 520, height: 320 }
    node.width = size.width
    node.height = size.height
    node.x = 0
    node.y = existingBottom + HEADER_GAP * (movedSchemas.indexOf(node) + 1)
    handled.add(node.id)
  }

  for (const node of placed.filter((candidate) => nodeType(candidate) === 'db_enum')) {
    const size = sizes[node.id] ?? { width: 280, height: 140 }
    node.width = size.width
    node.height = size.height
    if (enums.length > 0) {
      const rightmost = enums.reduce((best, candidate) => (
        candidate.x + nodeSize(candidate, sizes).width > best.x + nodeSize(best, sizes).width
          ? candidate
          : best
      ))
      node.x = rightmost.x + nodeSize(rightmost, sizes).width + ENUM_GAP
      node.y = Math.min(...enums.map((candidate) => candidate.y))
    } else {
      node.x = 0
      node.y = existingBottom + HEADER_GAP
    }
    handled.add(node.id)
  }

  for (const node of placed.filter((candidate) => nodeType(candidate) === 'table')) {
    const size = sizes[node.id] ?? { width: 360, height: 300 }
    node.width = size.width
    node.height = size.height
    const schema = schemaNodes.find((candidate) => stringField(candidate, 'name') === schemaName(node))
    const laneTables = tables.filter((candidate) => schemaName(candidate) === schemaName(node))
    if (schema) {
      const laneRight = laneTables.reduce(
        (max, candidate) => Math.max(max, candidate.x + nodeSize(candidate, sizes).width),
        schema.x + LANE_PADDING,
      )
      node.x = laneRight + COLUMN_GAP
      node.y = schema.y + LANE_HEADER
    } else {
      node.x = 0
      node.y = existingBottom + HEADER_GAP
    }
    handled.add(node.id)
  }

  for (const node of placed) {
    if (handled.has(node.id)) continue
    node.x = existingRight + COLUMN_GAP
    node.y = existingBottom + HEADER_GAP
  }

  return placed
}
