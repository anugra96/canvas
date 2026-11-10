import { getGroupMembers, type CanvasNode } from '@canvas/contract'

import type { CanvasFlowEdge, CanvasFlowNode } from '../../model/adapter'

export interface DuplicateSelectionInput {
  nodes: CanvasFlowNode[]
  edges: CanvasFlowEdge[]
  createId: () => string
}

export interface DuplicateSelectionResult {
  nodes: CanvasFlowNode[]
  edges: CanvasFlowEdge[]
}

export function duplicateSelection({
  nodes,
  edges,
  createId,
}: DuplicateSelectionInput): DuplicateSelectionResult {
  const selectedNodes = nodes.filter((node) => node.selected)
  if (selectedNodes.length === 0) return { nodes: [], edges: [] }

  const idMap = new Map(selectedNodes.map((node) => [node.id, createId()]))
  const nodeClones = selectedNodes.map((node) => {
    const id = idMap.get(node.id) as string
    const raw = { ...node.data.raw, id } as CanvasNode
    if (raw.type === 'group') {
      const members = getGroupMembers(raw)
      if (members) {
        raw.app = {
          ...(raw.app ?? {}),
          groupMembers: members
            .map((memberId) => idMap.get(memberId))
            .filter((memberId): memberId is string => Boolean(memberId)),
        }
      }
    }
    return {
      ...node,
      id,
      position: { x: node.position.x + 40, y: node.position.y + 40 },
      selected: true,
      data: { ...node.data, raw },
    }
  })

  const edgeClones: CanvasFlowEdge[] = []
  for (const edge of edges) {
    const source = idMap.get(edge.source) ?? (edge.selected ? edge.source : undefined)
    const target = idMap.get(edge.target) ?? (edge.selected ? edge.target : undefined)
    if (!source || !target) continue
    if (!edge.selected && !(idMap.has(edge.source) && idMap.has(edge.target))) continue
    const raw = edge.data?.raw
    if (!raw) continue
    const id = createId()
    edgeClones.push({
      ...edge,
      id,
      source,
      target,
      selected: true,
      data: { ...edge.data, raw: { ...raw, id, fromNode: source, toNode: target } },
    })
  }

  return { nodes: nodeClones, edges: edgeClones }
}
