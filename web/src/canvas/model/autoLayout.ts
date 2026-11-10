import dagre from '@dagrejs/dagre'

import {
  nodeDimensions,
  type CanvasFlowEdge,
  type CanvasFlowNode,
} from './adapter'

export interface AutoLayoutOptions {
  direction?: 'LR' | 'TB'
  nodeSpacing?: number
  rankSpacing?: number
}

function dagrePositions(
  layoutNodes: CanvasFlowNode[],
  edges: CanvasFlowEdge[],
  options: AutoLayoutOptions,
): Map<string, { x: number; y: number }> {
  const graph = new dagre.graphlib.Graph({ multigraph: true })
  graph.setGraph({
    rankdir: options.direction ?? 'LR',
    nodesep: options.nodeSpacing ?? 72,
    ranksep: options.rankSpacing ?? 150,
    marginx: 40,
    marginy: 40,
  })
  graph.setDefaultEdgeLabel(() => ({}))
  const layoutIds = new Set(layoutNodes.map((node) => node.id))

  for (const node of layoutNodes) {
    const size = nodeDimensions(node)
    graph.setNode(node.id, { width: size.width, height: size.height })
  }
  for (const edge of edges) {
    if (!layoutIds.has(edge.source) || !layoutIds.has(edge.target)) continue
    if (edge.source === edge.target) continue
    graph.setEdge(edge.source, edge.target, { weight: 1 }, edge.id)
  }

  dagre.layout(graph)
  const positions = new Map<string, { x: number; y: number }>()
  for (const node of layoutNodes) {
    const positioned = graph.node(node.id)
    positions.set(node.id, {
      x: positioned.x - positioned.width / 2,
      y: positioned.y - positioned.height / 2,
    })
  }
  return positions
}

export function autoLayoutCanvas(
  nodes: CanvasFlowNode[],
  edges: CanvasFlowEdge[],
  options: AutoLayoutOptions = {},
): { nodes: CanvasFlowNode[]; edges: CanvasFlowEdge[] } {
  const layoutNodes = nodes.filter((node) => node.type !== 'group')
  if (layoutNodes.length === 0) return { nodes, edges }
  const positions = dagrePositions(layoutNodes, edges, options)
  const nextNodes = nodes.map((node) => {
    const position = positions.get(node.id)
    if (!position) return node
    return { ...node, position }
  })
  return { nodes: nextNodes, edges }
}
