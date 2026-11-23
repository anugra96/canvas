import { applyEdgeChanges, type Connection, type EdgeChange } from '@xyflow/react'
import { useCallback, useState } from 'react'

import type { Ontology } from '@canvas/contract'

import {
  applyEndpointToFlowEdge,
  applyLabelToFlowEdge,
  applyRelationToFlowEdge,
  reconnectFlowEdge,
  reverseFlowEdge,
} from '../../model/edgeRelations'
import type { CanvasFlowEdge, CanvasFlowNode } from '../../model/adapter'
import { clamp } from './geometry'
import type { EdgeLabelEditorState } from './types'

interface UseCanvasEdgesInput {
  edges: CanvasFlowEdge[]
  setNodes: (update: (current: CanvasFlowNode[]) => CanvasFlowNode[]) => void
  setEdges: (update: (current: CanvasFlowEdge[]) => CanvasFlowEdge[]) => void
  markDirty: () => void
  ontology: Ontology
  isSystems: boolean
  flowRef: React.RefObject<HTMLDivElement | null>
}

export function useCanvasEdges({
  edges,
  setNodes,
  setEdges,
  markDirty,
  ontology,
  isSystems,
  flowRef,
}: UseCanvasEdgesInput) {
  const [edgeLabelEditor, setEdgeLabelEditor] = useState<EdgeLabelEditorState | null>(null)

  const onEdgesChange = useCallback((changes: EdgeChange<CanvasFlowEdge>[]) => {
    setEdges((current) => applyEdgeChanges(changes, current))
    const material = changes.some((change) =>
      change.type === 'remove'
      || change.type === 'add'
      || change.type === 'replace')
    if (material) markDirty()
  }, [markDirty, setEdges])

  const selectEdge = useCallback((id: string) => {
    setNodes((current) => current.map((node) => ({ ...node, selected: false })))
    setEdges((current) => current.map((edge) => ({ ...edge, selected: edge.id === id })))
  }, [setEdges, setNodes])

  const openEdgeLabelEditor = useCallback((id: string, clientX: number, clientY: number) => {
    const bounds = flowRef.current?.getBoundingClientRect()
    if (!bounds) return
    const edge = edges.find((candidate) => candidate.id === id)
    setEdgeLabelEditor({
      edgeId: id,
      label: edge?.data?.label ?? '',
      x: clamp(clientX - bounds.left, 8, bounds.width - 270),
      y: clamp(clientY - bounds.top, 8, bounds.height - 150),
    })
  }, [edges, flowRef])

  const onReconnect = useCallback((oldEdge: CanvasFlowEdge, connection: Connection) => {
    setEdges((current) => current.map((edge) =>
      edge.id === oldEdge.id ? reconnectFlowEdge(edge, connection) : edge))
    markDirty()
  }, [markDirty, setEdges])

  const reverseSelectedEdges = useCallback(() => {
    if (!edges.some((edge) => edge.selected)) return
    setEdges((current) => current.map((edge) =>
      edge.selected ? reverseFlowEdge(edge) : edge))
    markDirty()
  }, [edges, markDirty, setEdges])

  const changeRelation = useCallback((relationTypeId: string) => {
    if (relationTypeId === 'mixed') return
    setEdges((current) => current.map((edge) => {
      if (!edge.selected) return edge
      const next = applyRelationToFlowEdge(edge, relationTypeId, ontology)
      if (isSystems && !relationTypeId && next.data) {
        next.label = 'Define relation'
        next.data = {
          ...next.data,
          label: 'Define relation',
          raw: { ...next.data.raw, label: 'Define relation' },
        }
      }
      return next
    }))
    markDirty()
  }, [isSystems, markDirty, ontology, setEdges])

  const saveEdgeLabel = useCallback((value: string) => {
    const editor = edgeLabelEditor
    if (!editor) return
    setEdges((current) => current.map((edge) =>
      edge.id === editor.edgeId ? applyLabelToFlowEdge(edge, value) : edge))
    setEdgeLabelEditor(null)
    markDirty()
  }, [edgeLabelEditor, markDirty, setEdges])

  const changeEndpoint = useCallback((endpoint: string | undefined) => {
    setEdges((current) => current.map((edge) => (
      edge.selected ? applyEndpointToFlowEdge(edge, endpoint, ontology) : edge
    )))
    markDirty()
  }, [markDirty, ontology, setEdges])

  return {
    edgeLabelEditor,
    setEdgeLabelEditor,
    onEdgesChange,
    selectEdge,
    openEdgeLabelEditor,
    onReconnect,
    reverseSelectedEdges,
    changeRelation,
    saveEdgeLabel,
    changeEndpoint,
  }
}

