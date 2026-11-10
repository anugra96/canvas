import { createNodeId, type CanvasLink, type CanvasNode } from '@canvas/contract'

import type { CanvasFlowNode } from './adapter'

export function withCanvasLinks(node: CanvasFlowNode, links: CanvasLink[]): CanvasFlowNode {
  const raw = { ...node.data.raw } as CanvasNode
  const app = { ...(raw.app ?? {}) }
  if (links.length > 0) app.canvasLinks = links
  else delete (app as Record<string, unknown>).canvasLinks
  return {
    ...node,
    data: {
      ...node.data,
      raw: { ...raw, app } as CanvasNode,
    },
  }
}

export function createCanvasLink(canvasId: string, label = 'Documentation'): CanvasLink {
  return {
    id: createNodeId(),
    canvasId,
    label,
  }
}
