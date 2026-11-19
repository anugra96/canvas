import { addEdge, type Connection, type FinalConnectionState } from '@xyflow/react'
import { useCallback, useState } from 'react'

import { findEntityType, type CanvasNodeSide, type Ontology } from '@canvas/contract'

import { edgeFromConnection } from '../../model/edgeRelations'
import { nodeDimensions, toFlowEdge, toFlowNode, type CanvasFlowEdge, type CanvasFlowNode } from '../../model/adapter'
import { insertNodes } from '../../model/insertNodes'
import { clientPoint } from './geometry'
import { makeEntityNode, makeTextNode } from './nodes'
import type { EdgeLabelEditorState, PendingConnection } from './types'

const OPPOSITE_SIDE: Record<CanvasNodeSide, CanvasNodeSide> = {
  top: 'bottom',
  right: 'left',
  bottom: 'top',
  left: 'right',
}

interface UseCanvasConnectionsInput {
  nodes: CanvasFlowNode[]
  setNodes: (update: (current: CanvasFlowNode[]) => CanvasFlowNode[]) => void
  setEdges: (update: (current: CanvasFlowEdge[]) => CanvasFlowEdge[]) => void
  markDirty: () => void
  ontology: Ontology
  isSystems: boolean
  flowRef: React.RefObject<HTMLDivElement | null>
  clientToFlow: (clientX: number, clientY: number) => { x: number; y: number }
  setEdgeLabelEditor: (editor: EdgeLabelEditorState | null) => void
}

export function useCanvasConnections({
  nodes,
  setNodes,
  setEdges,
  markDirty,
  ontology,
  isSystems,
  flowRef,
  clientToFlow,
  setEdgeLabelEditor,
}: UseCanvasConnectionsInput) {
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null)
  const [connectNodeId, setConnectNodeId] = useState<string | null>(null)

  const onConnect = useCallback((connection: Connection) => {
    const raw = edgeFromConnection(connection, isSystems ? undefined : 'relates_to', ontology)
    if (isSystems) raw.label = 'Define relation'
    setNodes((current) => current.map((node) => ({ ...node, selected: false })))
    setEdges((current) => addEdge(toFlowEdge(raw, ontology), current).map((edge) => ({
      ...edge,
      selected: edge.id === raw.id,
    })))
    setConnectNodeId(null)
    markDirty()
  }, [isSystems, markDirty, ontology, setEdges, setNodes])

  const connectNodes = useCallback((sourceId: string, targetId: string) => {
    const source = nodes.find((node) => node.id === sourceId)
    const target = nodes.find((node) => node.id === targetId)
    if (!source || !target || source.type === 'group' || target.type === 'group' || source.data.entity?.entityType === 'resource' || target.data.entity?.entityType === 'resource') return
    const sourceSize = nodeDimensions(source)
    const targetSize = nodeDimensions(target)
    const dx = (target.position.x + targetSize.width / 2) - (source.position.x + sourceSize.width / 2)
    const dy = (target.position.y + targetSize.height / 2) - (source.position.y + sourceSize.height / 2)
    const horizontal = Math.abs(dx) >= Math.abs(dy)
    const sourceHandle = horizontal
      ? (dx >= 0 ? 'right' : 'left')
      : (dy >= 0 ? 'bottom' : 'top')
    const targetHandle = horizontal
      ? (dx >= 0 ? 'left' : 'right')
      : (dy >= 0 ? 'top' : 'bottom')
    const raw = edgeFromConnection({ source: sourceId, target: targetId, sourceHandle, targetHandle }, isSystems ? undefined : 'relates_to', ontology)
    if (isSystems) raw.label = 'Define relation'
    setNodes((current) => current.map((node) => ({ ...node, selected: false })))
    setEdges((current) => addEdge(toFlowEdge(raw, ontology), current).map((edge) => ({
      ...edge,
      selected: edge.id === raw.id,
    })))
    setConnectNodeId(null)
    markDirty()
  }, [isSystems, markDirty, nodes, ontology, setEdges, setNodes])

  const onConnectEnd = useCallback((
    event: { clientX: number; clientY: number } | TouchEvent,
    state: FinalConnectionState,
  ) => {
    if (state.toNode || !state.fromNode) return
    const bounds = flowRef.current?.getBoundingClientRect()
    if (!bounds) return
    const point = clientPoint(event)
    const flowPoint = clientToFlow(point.x, point.y)
    setPendingConnection({
      fromNodeId: state.fromNode.id,
      fromSide: state.fromPosition as CanvasNodeSide,
      position: flowPoint,
      screen: {
        x: point.x - bounds.left,
        y: point.y - bounds.top,
      },
    })
    setConnectNodeId(null)
    setEdgeLabelEditor(null)
  }, [clientToFlow, flowRef, setEdgeLabelEditor])

  const insertConnectedNode = useCallback((templateId: string) => {
    const pending = pendingConnection
    if (!pending) return
    const entityType = templateId === 'text'
      ? undefined
      : findEntityType(ontology, templateId)
    const width = templateId === 'text' ? 360 : entityType?.defaultSize.width
    const height = templateId === 'text' ? 200 : entityType?.defaultSize.height
    if (!width || !height) return

    const topLeft = {
      x: pending.position.x - width / 2,
      y: pending.position.y - height / 2,
    }
    const raw = templateId === 'text'
      ? makeTextNode(topLeft, width, height)
      : makeEntityNode(templateId, topLeft, ontology)
    if (!raw) return

    const edge = edgeFromConnection({
      source: pending.fromNodeId,
      target: raw.id,
      sourceHandle: pending.fromSide,
      targetHandle: OPPOSITE_SIDE[pending.fromSide],
    }, isSystems ? undefined : 'relates_to', ontology)
    if (isSystems) edge.label = 'Define relation'

    setPendingConnection(null)
    setNodes((current) => insertNodes(current, [{ ...toFlowNode(raw), selected: true }]))
    setEdges((current) => [...current, toFlowEdge(edge, ontology)])
    markDirty()
  }, [isSystems, markDirty, ontology, pendingConnection, setEdges, setNodes])

  return {
    pendingConnection,
    setPendingConnection,
    connectNodeId,
    setConnectNodeId,
    onConnect,
    connectNodes,
    onConnectEnd,
    insertConnectedNode,
  }
}
