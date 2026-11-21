import dagre from '@dagrejs/dagre'

import type { DerivedCard, DerivedRelation, DerivedView } from './derivedViews'

interface DiagramNode extends DerivedCard {
  x: number
  y: number
  width: number
  height: number
}

interface DiagramEdge extends DerivedRelation {
  path: string
  labelX: number
  labelY: number
}

export interface DerivedDiagram {
  width: number
  height: number
  nodes: DiagramNode[]
  edges: DiagramEdge[]
}

export interface DerivedLayoutOptions {
  seed?: Map<string, { x: number; y: number }>
  arrange?: 'seeded' | 'auto'
}

const PADDING = 32
const HEIGHT = 86
const SEEDED_GAP = 38

function nodeWidth(label: string): number {
  return Math.min(280, Math.max(200, label.length * 6.4 + 56))
}

function nodeHeight(node: Pick<DerivedCard, 'height'>): number {
  return node.height ?? HEIGHT
}

function edgeGeometry(
  source: DiagramNode,
  target: DiagramNode,
): Pick<DiagramEdge, 'path' | 'labelX' | 'labelY'> {
  const sourceX = source.x + source.width / 2
  const sourceY = source.y + source.height / 2
  const targetX = target.x + target.width / 2
  const targetY = target.y + target.height / 2
  const dx = targetX - sourceX
  const dy = targetY - sourceY

  if (Math.abs(dx) >= Math.abs(dy)) {
    const startX = dx >= 0 ? source.x + source.width : source.x
    const endX = dx >= 0 ? target.x : target.x + target.width
    const startY = sourceY
    const endY = targetY
    const bend = Math.max(42, Math.min(150, Math.abs(endX - startX) * 0.45))
    const controlA = startX + (dx >= 0 ? bend : -bend)
    const controlB = endX + (dx >= 0 ? -bend : bend)
    return {
      path: `M ${startX} ${startY} C ${controlA} ${startY}, ${controlB} ${endY}, ${endX} ${endY}`,
      labelX: (startX + endX) / 2,
      labelY: (startY + endY) / 2 - 7,
    }
  }

  const startY = dy >= 0 ? source.y + source.height : source.y
  const endY = dy >= 0 ? target.y : target.y + target.height
  const startX = sourceX
  const endX = targetX
  const bend = Math.max(42, Math.min(150, Math.abs(endY - startY) * 0.45))
  const controlA = startY + (dy >= 0 ? bend : -bend)
  const controlB = endY + (dy >= 0 ? -bend : bend)
  return {
    path: `M ${startX} ${startY} C ${startX} ${controlA}, ${endX} ${controlB}, ${endX} ${endY}`,
    labelX: (startX + endX) / 2 + 12,
    labelY: (startY + endY) / 2,
  }
}

function finishDiagram(view: DerivedView, nodes: DiagramNode[]): DerivedDiagram {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const edges = view.edges.flatMap((edge) => {
    const source = byId.get(edge.from)
    const target = byId.get(edge.to)
    if (!source || !target) return []
    return [{ ...edge, ...edgeGeometry(source, target) }]
  })

  const width = Math.ceil(nodes.reduce((right, node) => Math.max(right, node.x + node.width), 0) + PADDING)
  const height = Math.ceil(nodes.reduce((bottom, node) => Math.max(bottom, node.y + node.height), 0) + PADDING)
  return { width, height, nodes, edges }
}

function layoutAuto(view: DerivedView): DerivedDiagram {
  if (view.nodes.length === 0) {
    return { width: 0, height: 0, nodes: [], edges: [] }
  }

  const graph = new dagre.graphlib.Graph({ multigraph: true })
  graph.setGraph({
    rankdir: 'LR',
    nodesep: SEEDED_GAP,
    ranksep: 118,
    marginx: PADDING,
    marginy: PADDING,
  })
  graph.setDefaultEdgeLabel(() => ({}))
  const nodeIds = new Set(view.nodes.map((node) => node.id))

  for (const node of view.nodes) {
    graph.setNode(node.id, { width: nodeWidth(node.label), height: nodeHeight(node) })
  }
  for (const edge of view.edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) continue
    graph.setEdge(edge.from, edge.to, { weight: 1 }, edge.id)
  }

  dagre.layout(graph)

  const nodes = view.nodes.map((node) => {
    const positioned = graph.node(node.id)
    const width = nodeWidth(node.label)
    const height = nodeHeight(node)
    return {
      ...node,
      width,
      height,
      x: positioned.x - width / 2,
      y: positioned.y - height / 2,
    }
  })
  return finishDiagram(view, nodes)
}

interface SeedEntry {
  card: DerivedCard
  point: { x: number; y: number }
  width: number
  height: number
}

interface SeedRect {
  x: number
  y: number
  width: number
  height: number
}

function seedScale(entries: SeedEntry[]): number {
  const distances: number[] = []
  for (let index = 0; index < entries.length; index += 1) {
    let nearest = Number.POSITIVE_INFINITY
    for (let other = 0; other < entries.length; other += 1) {
      if (other === index) continue
      const distance = Math.hypot(
        entries[index]!.point.x - entries[other]!.point.x,
        entries[index]!.point.y - entries[other]!.point.y,
      )
      if (distance > 0 && distance < nearest) nearest = distance
    }
    if (Number.isFinite(nearest)) distances.push(nearest)
  }
  if (distances.length === 0) return 1
  distances.sort((left, right) => left - right)
  const median = distances[Math.floor(distances.length / 2)]!
  const extent = entries.reduce(
    (total, entry) => total + Math.max(entry.width, entry.height),
    0,
  ) / entries.length
  if (!Number.isFinite(median) || median <= 0) return 1
  return Math.max(1, (extent + SEEDED_GAP) / median)
}

function needsPush(rect: SeedRect, placed: SeedRect): boolean {
  const sharesRows = rect.y < placed.y + placed.height + SEEDED_GAP
    && placed.y < rect.y + rect.height + SEEDED_GAP
  return sharesRows
    && rect.x < placed.x + placed.width + SEEDED_GAP
    && placed.x < rect.x + rect.width + SEEDED_GAP
}

function seededPosition(entries: SeedEntry[]): Map<string, SeedRect> | undefined {
  const distinct = new Set(entries.map((entry) => `${entry.point.x}\u0000${entry.point.y}`))
  if (entries.length < 2 || distinct.size < 2) return undefined

  const scale = seedScale(entries)
  const rects = new Map<string, SeedRect>()
  for (const entry of entries) {
    rects.set(entry.card.id, {
      x: entry.point.x * scale - entry.width / 2,
      y: entry.point.y * scale - entry.height / 2,
      width: entry.width,
      height: entry.height,
    })
  }

  const byY = [...entries].sort((left, right) => (
    left.point.y - right.point.y
    || left.point.x - right.point.x
    || left.card.id.localeCompare(right.card.id)
  ))
  let lastY = Number.NEGATIVE_INFINITY
  for (const entry of byY) {
    const rect = rects.get(entry.card.id)!
    rect.y = Math.max(rect.y, lastY)
    lastY = rect.y
  }

  const byX = [...entries].sort((left, right) => (
    left.point.x - right.point.x
    || left.point.y - right.point.y
    || left.card.id.localeCompare(right.card.id)
  ))
  let lastX = Number.NEGATIVE_INFINITY
  const placed: SeedRect[] = []
  for (const entry of byX) {
    const rect = rects.get(entry.card.id)!
    rect.x = Math.max(rect.x, lastX)
    const pushing = placed.filter((other) => needsPush(rect, other))
    if (pushing.length > 0) {
      rect.x = Math.max(rect.x, ...pushing.map((other) => other.x + other.width + SEEDED_GAP))
    }
    lastX = rect.x
    placed.push(rect)
  }
  return rects
}

function layoutSeeded(view: DerivedView, seed: Map<string, { x: number; y: number }>): DerivedDiagram | undefined {
  const sized = view.nodes.map((card) => ({
    card,
    width: nodeWidth(card.label),
    height: nodeHeight(card),
  }))
  const entries: SeedEntry[] = sized.flatMap((entry) => {
    if (entry.card.isUnassigned) return []
    const point = seed.get(entry.card.id)
    return point ? [{ ...entry, point }] : []
  })
  const rects = seededPosition(entries)
  if (!rects) return undefined

  const byId = (left: { card: DerivedCard }, right: { card: DerivedCard }) => (
    left.card.id.localeCompare(right.card.id)
  )
  const rightOfAll = (): number => Math.max(
    PADDING,
    ...[...rects.values()].map((rect) => rect.x + rect.width),
  )
  const bottomOfAll = (): number => Math.max(
    PADDING,
    ...[...rects.values()].map((rect) => rect.y + rect.height),
  )

  let cursor = Math.min(...[...rects.values()].map((rect) => rect.y), PADDING)
  for (const entry of sized.filter(({ card }) => !card.isUnassigned && !seed.has(card.id)).sort(byId)) {
    const x = rightOfAll() + SEEDED_GAP
    const rect = { x, y: cursor, width: entry.width, height: entry.height }
    rects.set(entry.card.id, rect)
    cursor = rect.y + rect.height + SEEDED_GAP
  }

  let unassignedY = bottomOfAll() + SEEDED_GAP
  for (const entry of sized.filter(({ card }) => card.isUnassigned).sort(byId)) {
    const rect = {
      x: rightOfAll() + SEEDED_GAP,
      y: unassignedY,
      width: entry.width,
      height: entry.height,
    }
    rects.set(entry.card.id, rect)
    unassignedY = rect.y + rect.height + SEEDED_GAP
  }

  if (view.nodes.some((card) => !rects.has(card.id))) return undefined
  const minX = Math.min(...[...rects.values()].map((rect) => rect.x))
  const minY = Math.min(...[...rects.values()].map((rect) => rect.y))
  const dx = PADDING - minX
  const dy = PADDING - minY
  const nodes = view.nodes.map((card) => {
    const rect = rects.get(card.id)!
    return {
      ...card,
      width: rect.width,
      height: rect.height,
      x: rect.x + dx,
      y: rect.y + dy,
    }
  })
  return finishDiagram(view, nodes)
}

export function layoutDerivedView(
  view: DerivedView,
  options: DerivedLayoutOptions = {},
): DerivedDiagram {
  if (view.nodes.length === 0) {
    return { width: 0, height: 0, nodes: [], edges: [] }
  }
  if (options.seed && options.arrange !== 'auto') {
    const seeded = layoutSeeded(view, options.seed)
    if (seeded) return seeded
  }
  return layoutAuto(view)
}
