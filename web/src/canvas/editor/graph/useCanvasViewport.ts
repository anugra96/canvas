import { useReactFlow } from '@xyflow/react'
import { useCallback } from 'react'

import type { CanvasFlowNode } from '../../model/adapter'

interface UseCanvasViewportInput {
  nodes: CanvasFlowNode[]
  flowRef: React.RefObject<HTMLDivElement | null>
}

export function useCanvasViewport({ nodes, flowRef }: UseCanvasViewportInput) {
  const { fitView, getViewport } = useReactFlow()

  const clientToFlow = useCallback((clientX: number, clientY: number) => {
    const bounds = flowRef.current?.getBoundingClientRect()
    const viewport = getViewport()
    if (!bounds) return { x: clientX, y: clientY }
    return {
      x: (clientX - bounds.left - viewport.x) / viewport.zoom,
      y: (clientY - bounds.top - viewport.y) / viewport.zoom,
    }
  }, [flowRef, getViewport])

  const fitCanvas = useCallback(() => {
    void fitView({ padding: 0.25, maxZoom: 1.2 })
  }, [fitView])

  const zoomSelection = useCallback(() => {
    const selected = nodes.filter((node) => node.selected)
    if (selected.length === 0) {
      void fitView({ padding: 0.25, maxZoom: 1.2 })
      return
    }
    void fitView({ nodes: selected, padding: 0.25, maxZoom: 1.2 })
  }, [fitView, nodes])

  return {
    clientToFlow,
    fitCanvas,
    zoomSelection,
  }
}
