import {
  getGroupMembers,
  planLayout,
  type CanvasEdge,
  type CanvasNode,
  type GroupJoin,
  type GroupResize,
  type Point,
  type Sizes,
} from '@canvas/contract'

import {
  fromFlowCanvas,
  nodeDimensions,
  type CanvasFlowEdge,
  type CanvasFlowNode,
} from '../../model/adapter'

export interface PlacementPlan {
  position: Point
  joins: GroupJoin[]
  groupResizes: GroupResize[]
}

export interface Placement extends PlacementPlan {
  visible: boolean
}

export interface PlaceRequest {
  node: CanvasNode
  base?: Point
  extraEdges?: CanvasEdge[]
}

export function planPlacement(
  nodes: CanvasFlowNode[],
  edges: CanvasFlowEdge[],
  request: PlaceRequest,
): PlacementPlan {
  const canvas = fromFlowCanvas(nodes, edges, {})
  const sizes: Sizes = Object.fromEntries(nodes.map((node) => [node.id, nodeDimensions(node)]))
  const rawNodes = [
    ...(canvas.nodes ?? []).filter((node) => node.id !== request.node.id),
    request.node,
  ]
  const plan = planLayout(
    {
      ...canvas,
      nodes: rawNodes,
      edges: [...(canvas.edges ?? []), ...(request.extraEdges ?? [])],
    },
    {
      kind: 'place',
      nodeIds: [request.node.id],
      ...(request.base ? { base: request.base } : {}),
    },
    sizes,
  )
  const move = plan.moves.find((candidate) => candidate.id === request.node.id)
  return {
    position: move?.to ?? { x: request.node.x, y: request.node.y },
    joins: plan.joins,
    groupResizes: plan.groupResizes,
  }
}

function containsNode(groupNode: CanvasFlowNode, card: CanvasFlowNode): boolean {
  const groupSize = nodeDimensions(groupNode)
  const cardSize = nodeDimensions(card)
  return card.position.x >= groupNode.position.x
    && card.position.y >= groupNode.position.y
    && card.position.x + cardSize.width <= groupNode.position.x + groupSize.width
    && card.position.y + cardSize.height <= groupNode.position.y + groupSize.height
}

export function applyPlacementToNodes(
  nodes: CanvasFlowNode[],
  placement: Pick<PlacementPlan, 'joins' | 'groupResizes'>,
): CanvasFlowNode[] {
  const resizes = new Map(placement.groupResizes.map((resize) => [resize.id, resize]))
  const joinedIds = new Map<string, string[]>()
  for (const join of placement.joins) {
    joinedIds.set(join.groupId, [...(joinedIds.get(join.groupId) ?? []), join.nodeId])
  }

  return nodes.map((node) => {
    let next = node
    const resize = resizes.get(node.id)
    if (resize && node.type === 'group') {
      next = {
        ...next,
        position: { x: resize.x, y: resize.y },
        style: { ...next.style, width: resize.width, height: resize.height },
        data: {
          ...next.data,
          raw: {
            ...next.data.raw,
            x: resize.x,
            y: resize.y,
            width: resize.width,
            height: resize.height,
          },
        },
      }
    }

    const joins = joinedIds.get(node.id)
    if (!joins || next.type !== 'group') return next
    const existing = getGroupMembers(next.data.raw)
    const members = existing ?? nodes
      .filter((candidate) => (
        candidate.id !== next.id
        && candidate.type !== 'group'
        && containsNode(node, candidate)
      ))
      .map((candidate) => candidate.id)
    const groupMembers = [...new Set([...members, ...joins])]
    return {
      ...next,
      data: {
        ...next.data,
        raw: {
          ...next.data.raw,
          app: { ...(next.data.raw.app ?? {}), groupMembers },
        } as CanvasNode,
      },
    }
  })
}
