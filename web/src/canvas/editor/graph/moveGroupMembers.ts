import { getGroupMembers } from '@canvas/contract'

import { nodeDimensions, type CanvasFlowNode } from '../../model/adapter'

function isLane(node: CanvasFlowNode): boolean {
  return node.type === 'group' || node.data.entity?.entityType === 'resource'
}

export interface NodePositionChange {
  id: string
  position: { x: number; y: number }
}

export function moveGroupMembers(
  current: CanvasFlowNode[],
  next: CanvasFlowNode[],
  positionChanges: NodePositionChange[],
): CanvasFlowNode[] {
  if (positionChanges.length === 0) return next
  const movingIds = new Set(positionChanges.map((change) => change.id))
  const nextById = new Map(next.map((node) => [node.id, node]))

  for (const change of positionChanges) {
    const group = current.find((node) => node.id === change.id)
    if (!group || !isLane(group)) continue
    const dx = change.position.x - group.position.x
    const dy = change.position.y - group.position.y
    if (dx === 0 && dy === 0) continue
    const groupSize = nodeDimensions(group)
    const members = getGroupMembers(group.data.raw)
    const memberIds = members ? new Set(members) : null

    for (const node of current) {
      if (node.id === group.id || isLane(node) || movingIds.has(node.id)) continue
      if (memberIds) {
        if (!memberIds.has(node.id)) continue
      } else {
        const size = nodeDimensions(node)
        const inside = node.position.x >= group.position.x
          && node.position.y >= group.position.y
          && node.position.x + size.width <= group.position.x + groupSize.width
          && node.position.y + size.height <= group.position.y + groupSize.height
        if (!inside) continue
      }
      const existing = nextById.get(node.id)
      if (!existing) continue
      const x = existing.position.x + dx
      const y = existing.position.y + dy
      nextById.set(node.id, {
        ...existing,
        position: { x, y },
        data: { ...existing.data, raw: { ...existing.data.raw, x, y } },
      })
    }
  }

  return next.map((node) => nextById.get(node.id) ?? node)
}
