import dagre from '@dagrejs/dagre'

import type { DerivedCard, DerivedRelation, DerivedView } from './derivedViews'

export interface DiagramNode extends DerivedCard {
  x: number
  y: number
  width: number
  height: number
}

export interface DiagramEdge extends DerivedRelation {
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

const PADDING = 32
const HEIGHT = 86

function nodeWidth(label: string): number {
  return Math.min(280, Math.max(200, label.length * 6.4 + 56))
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

export function layoutDerivedView(view: DerivedView): DerivedDiagram {
  if (view.nodes.length === 0) {
    return { width: 0, height: 0, nodes: [], edges: [] }
  }

  const graph = new dagre.graphlib.Graph({ multigraph: true })
  graph.setGraph({
    rankdir: 'LR',
    nodesep: 38,
    ranksep: 118,
    marginx: PADDING,
    marginy: PADDING,
  })
  graph.setDefaultEdgeLabel(() => ({}))
  const nodeIds = new Set(view.nodes.map((node) => node.id))

  for (const node of view.nodes) {
    graph.setNode(node.id, { width: nodeWidth(node.label), height: HEIGHT })
  }
  for (const edge of view.edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) continue
    graph.setEdge(edge.from, edge.to, { weight: 1 }, edge.id)
  }

  dagre.layout(graph)

  const nodes = view.nodes.map((node) => {
    const positioned = graph.node(node.id)
    const width = nodeWidth(node.label)
    return {
      ...node,
      width,
      height: HEIGHT,
      x: positioned.x - width / 2,
      y: positioned.y - HEIGHT / 2,
    }
  })
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
