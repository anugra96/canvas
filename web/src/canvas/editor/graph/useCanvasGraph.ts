import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type FinalConnectionState,
  type NodeChange,
} from '@xyflow/react'
import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'

import {
  createNodeId,
  findEntityType,
  getGroupMembers,
  renderEntityMarkdown,
} from '@canvas/contract'
import type {
  CanvasNode,
  CanvasNodeSide,
  EntityFields,
  Ontology,
} from '@canvas/contract'

import { findSnap, type AlignmentGuide } from '../../model/alignment'
import { autoLayoutCanvas } from '../../model/autoLayout'
import { nodeDimensions, toFlowEdge, toFlowNode, type CanvasFlowEdge, type CanvasFlowNode } from '../../model/adapter'
import { insertNodes } from '../../model/insertNodes'
import { convertNodeType } from '../../model/cardTypes'
import {
  applyColorToFlowEdge,
  applyLabelToFlowEdge,
  applyRelationToFlowEdge,
  edgeFromConnection,
  reconnectFlowEdge,
  reverseFlowEdge,
} from '../../model/edgeRelations'
import { findBestCardSize } from '../autoFit'
import { clientPoint, clamp } from './geometry'
import { makeEntityNode, makeTextNode } from './nodes'
import type { CardMenuState, EdgeLabelEditorState, PendingConnection } from './types'

const OPPOSITE_SIDE: Record<CanvasNodeSide, CanvasNodeSide> = {
  top: 'bottom',
  right: 'left',
  bottom: 'top',
  left: 'right',
}

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
  const { fitView, getViewport, getZoom } = useReactFlow()
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null)
  const [cardMenu, setCardMenu] = useState<CardMenuState | null>(null)
  const [edgeLabelEditor, setEdgeLabelEditor] = useState<EdgeLabelEditorState | null>(null)
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuide[]>([])
  const [connectNodeId, setConnectNodeId] = useState<string | null>(null)
  const [sizeDialogOpen, setSizeDialogOpen] = useState(false)
  const nodesRef = useRef(nodes)

  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])

  const clientToFlow = useCallback((clientX: number, clientY: number) => {
    const bounds = flowRef.current?.getBoundingClientRect()
    const viewport = getViewport()
    if (!bounds) return { x: clientX, y: clientY }
    return {
      x: (clientX - bounds.left - viewport.x) / viewport.zoom,
      y: (clientY - bounds.top - viewport.y) / viewport.zoom,
    }
  }, [flowRef, getViewport])

  const updateText = useCallback((id: string, text: string) => {
    setNodes((current) => current.map((node) => node.id === id
      ? { ...node, data: { ...node.data, text, raw: { ...node.data.raw, text } } }
      : node))
    markDirty()
  }, [markDirty, setNodes])

  const updateLabel = useCallback((id: string, label: string) => {
    setNodes((current) => current.map((node) => node.id === id
      ? { ...node, data: { ...node.data, label, raw: { ...node.data.raw, label } } }
      : node))
    markDirty()
  }, [markDirty, setNodes])

  const updateEntityField = useCallback((id: string, fieldKey: string, value: string) => {
    setNodes((current) => current.map((node) => {
      if (node.id !== id || !node.data.entity) return node
      const entityType = findEntityType(ontology, node.data.entity.entityType)
      if (!entityType) return node
      const fields: EntityFields = { ...node.data.entity.fields, [fieldKey]: value }
      const text = renderEntityMarkdown(entityType, fields)
      const entity = { ...node.data.entity, fields }
      return {
        ...node,
        data: {
          ...node.data,
          entity,
          text,
          raw: { ...node.data.raw, app: entity, text },
        },
      }
    }))
    markDirty()
  }, [markDirty, ontology, setNodes])

  const resizeNode = useCallback((id: string, width: number, height: number) => {
    setNodes((current) => current.map((node) => node.id === id
      ? {
        ...node,
        style: { ...node.style, width, height },
        data: { ...node.data, raw: { ...node.data.raw, width, height } },
      }
      : node))
    markDirty()
  }, [markDirty, setNodes])

  const autoFitNode = useCallback((id: string) => {
    const flowNode = nodes.find((node) => node.id === id)
    if (!flowNode || flowNode.type === 'group') return
    const wrapper = flowRef.current?.querySelector<HTMLElement>(`.react-flow__node[data-id="${id}"]`)
    const card = wrapper?.querySelector<HTMLElement>('.canvas-node')
    if (!card) return
    const size = nodeDimensions(flowNode)
    const next = findBestCardSize(card, size.width, size.height)
    resizeNode(id, next.width, next.height)
  }, [flowRef, nodes, resizeNode])

  const groupSelected = useCallback(() => {
    const selected = nodes.filter((node) => node.selected && node.type !== 'group')
    if (selected.length === 0) return
    const bounds = selected.map((node) => {
      const size = nodeDimensions(node)
      return {
        left: node.position.x,
        top: node.position.y,
        right: node.position.x + size.width,
        bottom: node.position.y + size.height,
      }
    })
    const left = Math.min(...bounds.map((boundsItem) => boundsItem.left)) - 40
    const top = Math.min(...bounds.map((boundsItem) => boundsItem.top)) - 44
    const right = Math.max(...bounds.map((boundsItem) => boundsItem.right)) + 40
    const bottom = Math.max(...bounds.map((boundsItem) => boundsItem.bottom)) + 40
    const groupRaw = {
      id: createNodeId(),
      type: 'group',
      x: Math.round(left),
      y: Math.round(top),
      width: Math.round(right - left),
      height: Math.round(bottom - top),
      label: 'Group',
      app: { groupMembers: selected.map((node) => node.id) },
    } as CanvasNode
    setNodes((current) => insertNodes(
      current,
      [{ ...toFlowNode(groupRaw), selected: true }],
      'start',
    ))
    setEdges((current) => current.map((edge) => ({ ...edge, selected: false })))
    markDirty()
  }, [markDirty, nodes, setEdges, setNodes])

  const deleteSelected = useCallback(() => {
    const selectedNodeIds = new Set(nodes.filter((node) => node.selected).map((node) => node.id))
    const selectedEdgeIds = new Set(edges.filter((edge) => edge.selected).map((edge) => edge.id))
    if (selectedNodeIds.size === 0 && selectedEdgeIds.size === 0) return
    setNodes((current) => current.filter((node) => !selectedNodeIds.has(node.id)))
    setEdges((current) => current.filter((edge) =>
      !selectedEdgeIds.has(edge.id)
      && !selectedNodeIds.has(edge.source)
      && !selectedNodeIds.has(edge.target)))
    markDirty()
  }, [edges, markDirty, nodes, setEdges, setNodes])

  const applyColor = useCallback((color: string | undefined) => {
    setNodes((current) => current.map((node) => {
      if (!node.selected) return node
      const raw = { ...node.data.raw }
      if (color) raw.color = color
      else delete raw.color
      const style = { ...node.style }
      delete style.borderColor
      delete style.background
      return {
        ...node,
        data: { ...node.data, raw },
        style,
      }
    }))
    setEdges((current) => current.map((edge) =>
      edge.selected ? applyColorToFlowEdge(edge, color) : edge))
    markDirty()
  }, [markDirty, setEdges, setNodes])

  const undo = useCallback(() => {
    const snapshot = undoHistory({ nodes, edges })
    if (!snapshot) return
    setNodes(() => snapshot.nodes)
    setEdges(() => snapshot.edges)
    markDirty()
  }, [edges, markDirty, nodes, setEdges, setNodes, undoHistory])

  const redo = useCallback(() => {
    const snapshot = redoHistory({ nodes, edges })
    if (!snapshot) return
    setNodes(() => snapshot.nodes)
    setEdges(() => snapshot.edges)
    markDirty()
  }, [edges, markDirty, nodes, redoHistory, setEdges, setNodes])

  const selectAll = useCallback(() => {
    setNodes((current) => current.map((node) => ({ ...node, selected: true })))
    setEdges((current) => current.map((edge) => ({ ...edge, selected: true })))
  }, [setEdges, setNodes])

  const clearSelection = useCallback(() => {
    setNodes((current) => current.map((node) => ({ ...node, selected: false })))
    setEdges((current) => current.map((edge) => ({ ...edge, selected: false })))
    setConnectNodeId(null)
    setSizeDialogOpen(false)
  }, [setEdges, setNodes])

  const autoLayout = useCallback(() => {
    const layout = autoLayoutCanvas(nodes, edges)
    setNodes(() => layout.nodes)
    setEdges(() => layout.edges)
    setAlignmentGuides([])
    setNotice('Architecture layout applied.')
    markDirty()
    window.setTimeout(() => {
      void fitView({ padding: 0.2, maxZoom: 1.2, duration: 300 })
    }, 0)
  }, [edges, fitView, markDirty, nodes, setEdges, setNodes, setNotice])

  const autoFitAll = useCallback(() => {
    let fitted = 0
    const nextNodes = nodes.map((node) => {
      if (node.type === 'group') return node
      const wrapper = flowRef.current?.querySelector<HTMLElement>(`.react-flow__node[data-id="${node.id}"]`)
      const card = wrapper?.querySelector<HTMLElement>('.canvas-node')
      if (!card) return node
      const size = nodeDimensions(node)
      const next = findBestCardSize(card, size.width, size.height)
      if (next.width === size.width && next.height === size.height) return node
      fitted += 1
      return {
        ...node,
        style: { ...node.style, width: next.width, height: next.height },
        data: {
          ...node.data,
          raw: { ...node.data.raw, width: next.width, height: next.height },
        },
      }
    })
    setNodes(() => nextNodes)
    setAlignmentGuides([])
    setNotice(fitted > 0 ? `Auto-fitted ${fitted} cards.` : 'All cards already fit their content.')
    markDirty()
  }, [flowRef, markDirty, nodes, setNodes, setNotice])

  const duplicateSelection = useCallback(() => {
    const selectedNodes = nodes.filter((node) => node.selected)
    if (selectedNodes.length === 0) return

    const idMap = new Map(selectedNodes.map((node) => [node.id, createNodeId()]))
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
      const id = createNodeId()
      edgeClones.push({
        ...edge,
        id,
        source,
        target,
        selected: true,
        data: { ...edge.data, raw: { ...raw, id, fromNode: source, toNode: target } },
      })
    }

    setNodes((current) => insertNodes(current, nodeClones))
    setEdges((current) => [
      ...current.map((edge) => ({ ...edge, selected: false })),
      ...edgeClones,
    ])
    markDirty()
  }, [edges, markDirty, nodes, setEdges, setNodes])

  const nudgeSelection = useCallback((dx: number, dy: number) => {
    const selected = nodes.filter((node) => node.selected)
    if (selected.length === 0) return
    const moving = new Set(selected.map((node) => node.id))

    for (const group of nodes) {
      if (!group.selected || group.type !== 'group') continue
      const members = getGroupMembers(group.data.raw)
      if (members) {
        for (const memberId of members) moving.add(memberId)
        continue
      }
      const groupSize = nodeDimensions(group)
      for (const node of nodes) {
        if (node.id === group.id || node.type === 'group') continue
        const size = nodeDimensions(node)
        const inside = node.position.x >= group.position.x
          && node.position.y >= group.position.y
          && node.position.x + size.width <= group.position.x + groupSize.width
          && node.position.y + size.height <= group.position.y + groupSize.height
        if (inside) moving.add(node.id)
      }
    }

    setNodes((current) => current.map((node) => {
      if (!moving.has(node.id)) return node
      const x = node.position.x + dx
      const y = node.position.y + dy
      return {
        ...node,
        position: { x, y },
        data: { ...node.data, raw: { ...node.data.raw, x, y } },
      }
    }))
    markDirty()
  }, [markDirty, nodes, setNodes])

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

  const onNodesChange = useCallback((changes: NodeChange<CanvasFlowNode>[]) => {
    type PositionChange = Extract<NodeChange<CanvasFlowNode>, { type: 'position' }>
    const positionChanges = changes.filter((change): change is PositionChange =>
      change.type === 'position' && Boolean(change.position))
    let adjustedChanges = changes

    if (positionChanges.length > 0) {
      const movingIds = new Set(positionChanges.map((change) => change.id))
      const movingNodes = nodesRef.current
        .filter((node) => movingIds.has(node.id))
        .map((node) => {
          const change = positionChanges.find((candidate) => candidate.id === node.id)
          return { ...node, position: change?.position ?? node.position }
        })

      if (movingNodes.some((node) => node.type === 'group')) {
        setAlignmentGuides([])
      } else {
        const others = nodesRef.current.filter((node) => !movingIds.has(node.id))
        const snap = findSnap(
          movingNodes.map((node) => {
            const size = nodeDimensions(node)
            return { id: node.id, x: node.position.x, y: node.position.y, width: size.width, height: size.height }
          }),
          others.map((node) => {
            const size = nodeDimensions(node)
            return { id: node.id, x: node.position.x, y: node.position.y, width: size.width, height: size.height }
          }),
          8 / Math.max(getZoom(), 0.2),
        )
        setAlignmentGuides(snap.guides)
        if (snap.dx !== 0 || snap.dy !== 0) {
          adjustedChanges = changes.map((change) => {
            if (change.type !== 'position' || !change.position || !movingIds.has(change.id)) {
              return change
            }
            return {
              ...change,
              position: {
                x: change.position.x + snap.dx,
                y: change.position.y + snap.dy,
              },
            }
          })
        }
      }
    } else {
      setAlignmentGuides([])
    }

    setNodes((current) => {
      const next = applyNodeChanges(adjustedChanges, current)
      const appliedPositionChanges = adjustedChanges.filter((change): change is PositionChange =>
        change.type === 'position' && Boolean(change.position))
      if (appliedPositionChanges.length === 0) return next
      const movingIds = new Set(appliedPositionChanges.map((change) => change.id))
      const nextById = new Map(next.map((node) => [node.id, node]))

      for (const change of appliedPositionChanges) {
        if (!change.position) continue
        const group = current.find((node) => node.id === change.id)
        if (!group || group.type !== 'group') continue
        const dx = change.position.x - group.position.x
        const dy = change.position.y - group.position.y
        if (dx === 0 && dy === 0) continue
        const groupSize = nodeDimensions(group)
        const members = getGroupMembers(group.data.raw)
        const memberIds = members ? new Set(members) : null

        for (const node of current) {
          if (node.id === group.id || node.type === 'group' || movingIds.has(node.id)) continue
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
    })
    const material = changes.some((change) =>
      change.type === 'remove'
      || change.type === 'add'
      || change.type === 'replace'
      || (change.type === 'position' && change.dragging === false)
      || (change.type === 'dimensions' && change.resizing === false))
    if (material) markDirty()
  }, [getZoom, markDirty, setNodes])

  const onEdgesChange = useCallback((changes: EdgeChange<CanvasFlowEdge>[]) => {
    setEdges((current) => applyEdgeChanges(changes, current))
    const material = changes.some((change) =>
      change.type === 'remove'
      || change.type === 'add'
      || change.type === 'replace')
    if (material) markDirty()
  }, [markDirty, setEdges])

  const addCard = useCallback((position = { x: 120, y: 120 }) => {
    const raw = makeTextNode(position)
    setNodes((current) => insertNodes(current, [{ ...toFlowNode(raw), selected: true }]))
    markDirty()
  }, [markDirty, setNodes])

  const addEntity = useCallback((entityTypeId: string, position = { x: 120, y: 120 }) => {
    const raw = makeEntityNode(entityTypeId, position, ontology)
    if (!raw) return
    setNodes((current) => insertNodes(current, [{ ...toFlowNode(raw), selected: true }]))
    markDirty()
  }, [markDirty, ontology, setNodes])

  const onConnect = useCallback((connection: Connection) => {
    const raw = edgeFromConnection(connection, isSystems ? undefined : 'relates_to', ontology)
    if (isSystems) raw.label = 'Define relation'
    setEdges((current) => addEdge(toFlowEdge(raw, ontology), current))
    setConnectNodeId(null)
    markDirty()
  }, [isSystems, markDirty, ontology, setEdges])

  const connectNodes = useCallback((sourceId: string, targetId: string) => {
    const source = nodes.find((node) => node.id === sourceId)
    const target = nodes.find((node) => node.id === targetId)
    if (!source || !target || source.type === 'group' || target.type === 'group') return
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
    setEdges((current) => addEdge(toFlowEdge(raw, ontology), current))
    setConnectNodeId(null)
    markDirty()
  }, [isSystems, markDirty, nodes, ontology, setEdges])

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
  }, [clientToFlow, flowRef])

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

  const selectEdge = useCallback((id: string) => {
    setNodes((current) => current.map((node) => ({ ...node, selected: false })))
    setEdges((current) => current.map((edge) => ({ ...edge, selected: edge.id === id })))
  }, [setEdges, setNodes])

  const openEdgeLabelEditor = useCallback((id: string, clientX: number, clientY: number) => {
    const bounds = flowRef.current?.getBoundingClientRect()
    if (!bounds) return
    const edge = edges.find((candidate) => candidate.id === id)
    setPendingConnection(null)
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

  const selectedNodes = nodes.filter((node) => node.selected)
  const selectedEdges = edges.filter((edge) => edge.selected)
  const selectedRelationTypes = new Set(selectedEdges.map((edge) => edge.data?.relationType ?? ''))
  const selectedRelationValue = selectedRelationTypes.size === 0
    ? ''
    : selectedRelationTypes.size === 1
      ? [...selectedRelationTypes][0]
      : 'mixed'
  const singleSelectedNode = selectedNodes.length === 1 ? selectedNodes[0] : undefined
  const cardTypeValue = singleSelectedNode && singleSelectedNode.type !== 'group'
    ? singleSelectedNode.data.entity?.entityType ?? 'text'
    : undefined

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

  function changeCardType(typeId: string) {
    if (!singleSelectedNode) return
    setNodes((current) => current.map((node) =>
      node.id === singleSelectedNode.id ? convertNodeType(node, typeId, ontology) : node))
    markDirty()
  }

  const selectedGroups = selectedNodes.filter((node) => node.type === 'group')
  const selectedCards = selectedNodes.filter((node) => node.type !== 'group')
  const membershipGroup = selectedGroups.length === 1 ? selectedGroups[0] : undefined
  const membershipIds = membershipGroup
    ? getGroupMembers(membershipGroup.data.raw) ?? []
    : []
  const allSelectedCardsAreMembers = selectedCards.length > 0
    && selectedCards.every((card) => membershipIds.includes(card.id))
  const canManageMembership = Boolean(membershipGroup && selectedCards.length > 0)

  const toggleGroupMembership = useCallback(() => {
    if (!membershipGroup || selectedCards.length === 0) return
    const currentMembers = getGroupMembers(membershipGroup.data.raw) ?? []
    const selectedIds = new Set(selectedCards.map((card) => card.id))
    const allMembers = selectedCards.every((card) => currentMembers.includes(card.id))
    const nextMembers = allMembers
      ? currentMembers.filter((id) => !selectedIds.has(id))
      : [...new Set([...currentMembers, ...selectedCards.map((card) => card.id)])]
    setNodes((current) => current.map((node) => {
      if (node.id !== membershipGroup.id) return node
      const raw = {
        ...node.data.raw,
        app: { ...(node.data.raw.app ?? {}), groupMembers: nextMembers },
      } as CanvasNode
      return { ...node, data: { ...node.data, raw } }
    }))
    markDirty()
  }, [markDirty, membershipGroup, selectedCards, setNodes])

  const handleDoubleClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (!target.classList.contains('react-flow__pane')) return
    const bounds = flowRef.current?.getBoundingClientRect()
    if (!bounds) return
    setPendingConnection(null)
    setEdgeLabelEditor(null)
    setCardMenu({
      screen: { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
    })
  }, [flowRef])

  const insertCardFromMenu = useCallback((templateId: string) => {
    const menu = cardMenu
    if (!menu) return
    if (isSystems && templateId === 'text') return
    const entityType = templateId === 'text' ? undefined : findEntityType(ontology, templateId)
    const width = templateId === 'text' ? 360 : entityType?.defaultSize.width
    const height = templateId === 'text' ? 200 : entityType?.defaultSize.height
    if (!width || !height) return
    const bounds = flowRef.current?.getBoundingClientRect()
    if (!bounds) return
    const position = clientToFlow(menu.screen.x + bounds.left, menu.screen.y + bounds.top)
    const topLeft = {
      x: position.x - width / 2,
      y: position.y - height / 2,
    }
    const raw = templateId === 'text'
      ? makeTextNode(topLeft, width, height)
      : makeEntityNode(templateId, topLeft, ontology)
    if (!raw) return
    setCardMenu(null)
    setNodes((current) => insertNodes(current, [{ ...toFlowNode(raw), selected: true }]))
    markDirty()
  }, [cardMenu, clientToFlow, flowRef, isSystems, markDirty, ontology, setNodes])

  const centerPosition = useCallback((width = 360, height = 200): { x: number; y: number } => {
    const bounds = flowRef.current?.getBoundingClientRect()
    const position = clientToFlow(
      (bounds?.left ?? 0) + (bounds?.width ?? window.innerWidth) / 2,
      (bounds?.top ?? 0) + (bounds?.height ?? window.innerHeight) / 2,
    )
    return { x: position.x - width / 2, y: position.y - height / 2 }
  }, [clientToFlow, flowRef])

  const placementPosition = useCallback((width: number, height: number): {
    x: number
    y: number
    visible: boolean
  } => {
    const base = centerPosition(width, height)
    const gap = 24
    const stepX = width + gap
    const stepY = height + gap
    const occupied = nodes.filter((node) => node.type !== 'group')
    const bounds = flowRef.current?.getBoundingClientRect()
    const visibleTopLeft = bounds
      ? clientToFlow(bounds.left, bounds.top)
      : undefined
    const visibleBottomRight = bounds
      ? clientToFlow(bounds.right, bounds.bottom)
      : undefined
    const isFree = (x: number, y: number) => occupied.every((node) => {
      const size = nodeDimensions(node)
      return x + width + gap <= node.position.x
        || x >= node.position.x + size.width + gap
        || y + height + gap <= node.position.y
        || y >= node.position.y + size.height + gap
    })
    const isVisible = (x: number, y: number) => (
      !visibleTopLeft || !visibleBottomRight
      || (
        x >= visibleTopLeft.x + 16
        && y >= visibleTopLeft.y + 16
        && x + width <= visibleBottomRight.x - 16
        && y + height <= visibleBottomRight.y - 16
      )
    )

    let offscreen: { x: number; y: number } | undefined
    for (let radius = 0; radius <= 4; radius += 1) {
      for (let row = -radius; row <= radius; row += 1) {
        for (let column = -radius; column <= radius; column += 1) {
          if (Math.max(Math.abs(row), Math.abs(column)) !== radius) continue
          const x = base.x + column * stepX
          const y = base.y + row * stepY
          if (!isFree(x, y)) continue
          if (isVisible(x, y)) return { x, y, visible: true }
          offscreen ??= { x, y }
        }
      }
    }
    if (offscreen) return { ...offscreen, visible: false }
    const offset = (nodes.length % 6) * 52
    return { x: base.x + offset, y: base.y + offset, visible: false }
  }, [centerPosition, clientToFlow, flowRef, nodes])

  const revealPlacement = useCallback((visible: boolean) => {
    if (visible) return
    window.setTimeout(() => {
      void fitView({ padding: 0.25, maxZoom: 1 })
    }, 60)
  }, [fitView])

  const addAtCenter = useCallback(() => {
    addCard(centerPosition(360, 200))
  }, [addCard, centerPosition])

  const addNoteAtCenter = useCallback(() => {
    const noteType = findEntityType(ontology, 'note')
    if (!noteType) return
    const placement = placementPosition(noteType.defaultSize.width, noteType.defaultSize.height)
    addEntity('note', placement)
    revealPlacement(placement.visible)
  }, [addEntity, ontology, placementPosition, revealPlacement])

  const addEntityAtCenter = useCallback((entityTypeId: string) => {
    const entityType = findEntityType(ontology, entityTypeId)
    if (!entityType) return
    if (!isSystems) {
      addEntity(entityTypeId, centerPosition(entityType.defaultSize.width, entityType.defaultSize.height))
      return
    }
    const placement = placementPosition(entityType.defaultSize.width, entityType.defaultSize.height)
    addEntity(entityTypeId, placement)
    revealPlacement(placement.visible)
  }, [addEntity, centerPosition, isSystems, ontology, placementPosition, revealPlacement])

  const closeTransientUi = useCallback(() => {
    setPendingConnection(null)
    setCardMenu(null)
    setEdgeLabelEditor(null)
    setAlignmentGuides([])
    clearSelection()
    setConnectNodeId(null)
  }, [clearSelection])

  return {
    canUndo,
    canRedo,
    clientToFlow,
    updateText,
    updateLabel,
    updateEntityField,
    resizeNode,
    autoFitNode,
    groupSelected,
    deleteSelected,
    applyColor,
    undo,
    redo,
    selectAll,
    clearSelection,
    autoLayout,
    autoFitAll,
    duplicateSelection,
    nudgeSelection,
    fitCanvas,
    zoomSelection,
    onNodesChange,
    onEdgesChange,
    addCard,
    addEntity,
    onConnect,
    connectNodes,
    onConnectEnd,
    insertConnectedNode,
    selectEdge,
    openEdgeLabelEditor,
    onReconnect,
    reverseSelectedEdges,
    changeRelation,
    saveEdgeLabel,
    changeCardType,
    toggleGroupMembership,
    handleDoubleClick,
    insertCardFromMenu,
    placementPosition,
    revealPlacement,
    addAtCenter,
    addNoteAtCenter,
    addEntityAtCenter,
    closeTransientUi,
    pendingConnection,
    setPendingConnection,
    cardMenu,
    setCardMenu,
    edgeLabelEditor,
    setEdgeLabelEditor,
    alignmentGuides,
    setAlignmentGuides,
    connectNodeId,
    setConnectNodeId,
    sizeDialogOpen,
    setSizeDialogOpen,
    selectedNodes,
    selectedEdges,
    selectedRelationValue,
    singleSelectedNode,
    cardTypeValue,
    canManageMembership,
    allSelectedCardsAreMembers,
  }
}
