import { getGroupMembers } from '@canvas/contract'

import { nodeDimensions, type CanvasFlowNode } from '../../model/adapter'

const LANE_HEADER = 52
const LANE_PADDING = 24

export function growResourceLanes(nodes: CanvasFlowNode[]): CanvasFlowNode[] {
  return nodes.map((lane) => {
    if (lane.data.entity?.entityType !== 'resource') return lane
    const members = new Set(getGroupMembers(lane.data.raw) ?? [])
    if (members.size === 0) return lane
    const size = nodeDimensions(lane)
    let left = lane.position.x
    let top = lane.position.y
    let right = lane.position.x + size.width
    let bottom = lane.position.y + size.height
    for (const node of nodes) {
      if (!members.has(node.id)) continue
      const nodeSize = nodeDimensions(node)
      left = Math.min(left, node.position.x - LANE_PADDING)
      top = Math.min(top, node.position.y - LANE_HEADER - LANE_PADDING)
      right = Math.max(right, node.position.x + nodeSize.width + LANE_PADDING)
      bottom = Math.max(bottom, node.position.y + nodeSize.height + LANE_PADDING)
    }
    const width = right - left
    const height = bottom - top
    if (left === lane.position.x && top === lane.position.y && width === size.width && height === size.height) return lane
    return {
      ...lane,
      position: { x: left, y: top },
      style: { ...lane.style, width, height },
      data: { ...lane.data, raw: { ...lane.data.raw, x: left, y: top, width, height } },
    }
  })
}
