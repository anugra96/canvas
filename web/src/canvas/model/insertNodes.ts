import type { CanvasFlowNode } from './adapter'

export function insertNodes(
  current: CanvasFlowNode[],
  inserted: CanvasFlowNode[],
  placement: 'start' | 'end' = 'end',
): CanvasFlowNode[] {
  const cleared = current.map((node) => ({ ...node, selected: false }))
  return placement === 'start' ? [...inserted, ...cleared] : [...cleared, ...inserted]
}
