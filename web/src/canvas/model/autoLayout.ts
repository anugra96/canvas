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

export function dataFlowLayoutCanvas(
  nodes: CanvasFlowNode[],
  edges: CanvasFlowEdge[],
  options: AutoLayoutOptions = {},
): { nodes: CanvasFlowNode[]; edges: CanvasFlowEdge[] } {
  const annotationTypes = new Set(['note', 'decision', 'risk'])
  const annotationNodes = nodes.filter((node) => (
    node.type !== 'group' && annotationTypes.has(node.data.entity?.entityType ?? '')
  ))
  const schemaNodes = nodes.filter((node) => node.type === 'schema')
  const runtimeNodes = nodes.filter((node) => (
    node.type !== 'group'
    && node.type !== 'schema'
    && !annotationTypes.has(node.data.entity?.entityType ?? '')
  ))
  const positions = dagrePositions(runtimeNodes, edges, options)
  const nextNodes = nodes.map((node) => {
    const position = positions.get(node.id)
    if (!position) return node
    return { ...node, position }
  })
  if (schemaNodes.length === 0) {
    return { nodes: nextNodes, edges }
  }

  const runtimeById = new Map(runtimeNodes.map((node) => [node.id, node]))
  const maxRight = runtimeNodes.reduce((right, node) => {
    const position = positions.get(node.id)
    if (!position) return right
    return Math.max(right, position.x + nodeDimensions(node).width)
  }, 0)
  const schemaX = maxRight + 180
  const describedY = new Map<string, number[]>()
  for (const edge of edges) {
    if (edge.data?.relationType !== 'describes') continue
    const source = nextNodes.find((node) => node.id === edge.source)
    const target = runtimeById.get(edge.target)
    if (!source || !target || source.type !== 'schema') continue
    const targetPosition = positions.get(target.id)
    if (!targetPosition) continue
    const y = targetPosition.y + nodeDimensions(target).height / 2
    const list = describedY.get(source.id) ?? []
    list.push(y)
    describedY.set(source.id, list)
  }

  let cursorY = 40
  const placed = schemaNodes
    .map((schema) => {
      const targets = describedY.get(schema.id) ?? []
      const desired = targets.length > 0
        ? targets.reduce((sum, y) => sum + y, 0) / targets.length
        : Number.POSITIVE_INFINITY
      return { schema, desired }
    })
    .sort((left, right) => left.desired - right.desired || left.schema.id.localeCompare(right.schema.id))
    .map(({ schema, desired }) => {
      const size = nodeDimensions(schema)
      const y = Number.isFinite(desired)
        ? Math.max(cursorY, desired - size.height / 2)
        : cursorY
      cursorY = y + size.height + 56
      return { ...schema, position: { x: schemaX, y } }
    })
  const schemaById = new Map(placed.map((node) => [node.id, node]))
  const withSchemas = nextNodes.map((node) => schemaById.get(node.id) ?? node)
  const lowestY = withSchemas.reduce((bottom, node) => {
    if (node.type === 'group') return bottom
    const position = positions.get(node.id) ?? node.position
    return Math.max(bottom, position.y + nodeDimensions(node).height)
  }, 0)
  let noteX = 40
  let noteY = lowestY + 140
  let rowHeight = 0
  const annotationById = new Map<string, CanvasFlowNode>()
  for (const note of annotationNodes) {
    const size = nodeDimensions(note)
    if (noteX > 40 && noteX + size.width > 1600) {
      noteX = 40
      noteY += rowHeight + 40
      rowHeight = 0
    }
    annotationById.set(note.id, { ...note, position: { x: noteX, y: noteY } })
    noteX += size.width + 40
    rowHeight = Math.max(rowHeight, size.height)
  }
  const finalNodes = withSchemas.map((node) => annotationById.get(node.id) ?? node)
  return { nodes: finalNodes, edges }
}
