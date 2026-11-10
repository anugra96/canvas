import { useCallback } from 'react'

import type { Ontology } from '@canvas/contract'

import type { CanvasFlowEdge, CanvasFlowNode } from '../../model/adapter'
import { useCanvasConnections } from './useCanvasConnections'
import { useCanvasEdges } from './useCanvasEdges'
import { useCanvasLayout } from './useCanvasLayout'
import { useCanvasNodes } from './useCanvasNodes'
import { useCanvasPlacement } from './useCanvasPlacement'
import { useCanvasSelection } from './useCanvasSelection'
import { useCanvasViewport } from './useCanvasViewport'

interface UseCanvasGraphInput {
  nodes: CanvasFlowNode[]
  edges: CanvasFlowEdge[]
  setNodes: (update: (current: CanvasFlowNode[]) => CanvasFlowNode[]) => void
  setEdges: (update: (current: CanvasFlowEdge[]) => CanvasFlowEdge[]) => void
  markDirty: () => void
  setNotice: (message: string) => void
  ontology: Ontology
  isSystems: boolean
  flowRef: React.RefObject<HTMLDivElement | null>
  canUndo: boolean
  canRedo: boolean
  undoHistory: (snapshot: { nodes: CanvasFlowNode[]; edges: CanvasFlowEdge[] }) => { nodes: CanvasFlowNode[]; edges: CanvasFlowEdge[] } | null
  redoHistory: (snapshot: { nodes: CanvasFlowNode[]; edges: CanvasFlowEdge[] }) => { nodes: CanvasFlowNode[]; edges: CanvasFlowEdge[] } | null
}

export function useCanvasGraph({
  nodes,
  edges,
  setNodes,
  setEdges,
  markDirty,
  setNotice,
  ontology,
  isSystems,
  flowRef,
  canUndo,
  canRedo,
  undoHistory,
  redoHistory,
}: UseCanvasGraphInput) {
  const viewport = useCanvasViewport({ nodes, flowRef })
  const nodeState = useCanvasNodes({ nodes, setNodes, markDirty, ontology, flowRef })
  const layout = useCanvasLayout({
    nodes,
    edges,
    setNodes,
    setEdges,
    setAlignmentGuides: nodeState.setAlignmentGuides,
    markDirty,
    setNotice,
    flowRef,
  })
  const selection = useCanvasSelection({
    nodes,
    edges,
    setNodes,
    setEdges,
    markDirty,
    ontology,
    canUndo,
    canRedo,
    undoHistory,
    redoHistory,
  })
  const edgeState = useCanvasEdges({
    edges,
    setNodes,
    setEdges,
    markDirty,
    ontology,
    isSystems,
    flowRef,
  })
  const connections = useCanvasConnections({
    nodes,
    setNodes,
    setEdges,
    markDirty,
    ontology,
    isSystems,
    flowRef,
    clientToFlow: viewport.clientToFlow,
    setEdgeLabelEditor: edgeState.setEdgeLabelEditor,
  })
  const placement = useCanvasPlacement({
    nodes,
    setNodes,
    markDirty,
    ontology,
    isSystems,
    flowRef,
    clientToFlow: viewport.clientToFlow,
  })

  const clearSelection = useCallback(() => {
    selection.clearSelection()
    connections.setConnectNodeId(null)
  }, [connections, selection])

  const openEdgeLabelEditor = useCallback((id: string, clientX: number, clientY: number) => {
    connections.setPendingConnection(null)
    edgeState.openEdgeLabelEditor(id, clientX, clientY)
  }, [connections, edgeState])

  const closeTransientUi = useCallback(() => {
    connections.setPendingConnection(null)
    placement.setCardMenu(null)
    edgeState.setEdgeLabelEditor(null)
    nodeState.setAlignmentGuides([])
    clearSelection()
  }, [clearSelection, connections, edgeState, nodeState, placement])

  return {
    ...viewport,
    ...nodeState,
    ...layout,
    ...selection,
    ...edgeState,
    ...connections,
    ...placement,
    clearSelection,
    openEdgeLabelEditor,
    closeTransientUi,
  }
}

export type CanvasGraphState = ReturnType<typeof useCanvasGraph>
