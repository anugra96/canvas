import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  ViewportPortal,
  type Viewport,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type FinalConnectionState,
  type NodeChange,
} from '@xyflow/react'
import {
  ArrowLeft,
  Download,
  Keyboard,
  Plus,
  Redo2,
  Save,
  Undo2,
  X,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from 'react'

import {
  createNodeId,
  emptyEntityFields,
  findEntityType,
  getGroupMembers,
  mergeCanvas,
  renderEntityMarkdown,
  type CanvasDocument,
  type CanvasNode,
  type CanvasNodeSide,
  type EntityFields,
  type JsonCanvas,
  type MergeConflict,
  type Ontology,
  type TextNode,
} from '@skyward/canvas-contract'

import type { CanvasClient } from '../../api/client'
import { CanvasConflictError } from '../../api/errors'
import {
  fromFlowCanvas,
  nodeDimensions,
  toFlowCanvas,
  toFlowEdge,
  toFlowNode,
  type CanvasFlowEdge,
  type CanvasFlowNode,
} from '../model/adapter'
import { findSnap, type AlignmentGuide } from '../model/alignment'
import { convertNodeType } from '../model/cardTypes'
import {
  applyColorToFlowEdge,
  applyLabelToFlowEdge,
  applyRelationToFlowEdge,
  edgeFromConnection,
  reconnectFlowEdge,
  reverseFlowEdge,
} from '../model/edgeRelations'
import { useOntology } from '../../ontology/OntologyContext'
import { CanvasEditorActionsContext, type CanvasEditorActions } from './CanvasEditorContext'
import { ConnectionTemplateMenu } from './ConnectionTemplateMenu'
import { EdgeLabelEditor } from './EdgeLabelEditor'
import { KeyboardShortcutsDialog } from './KeyboardShortcutsDialog'
import { SelectionToolbar } from './SelectionToolbar'
import { isEditableTarget } from './shortcuts'
import { useCanvasHistory } from './useCanvasHistory'
import { readViewport, writeViewport } from './viewport'
import { CanvasEdge as CanvasEdgeComponent } from './edges/CanvasEdge'
import { CodeNode } from './nodes/CodeNode'
import { EntityNode } from './nodes/EntityNode'
import { FileNode } from './nodes/FileNode'
import { GroupNode } from './nodes/GroupNode'
import { LinkNode } from './nodes/LinkNode'
import { TextNode as TextNodeComponent } from './nodes/TextNode'

const nodeTypes = {
  text: TextNodeComponent,
  entity: EntityNode,
  code: CodeNode,
  group: GroupNode,
  file: FileNode,
  link: LinkNode,
}

const edgeTypes = {
  canvas: CanvasEdgeComponent,
}

interface CanvasEditorProps {
  client: CanvasClient
  document: CanvasDocument
  onBack: () => void
}

type SaveStatus = 'saved' | 'dirty' | 'saving' | 'conflict' | 'error'

const OPPOSITE_SIDE: Record<CanvasNodeSide, CanvasNodeSide> = {
  top: 'bottom',
  right: 'left',
  bottom: 'top',
  left: 'right',
}

interface PendingConnection {
  fromNodeId: string
  fromSide: CanvasNodeSide
  position: { x: number; y: number }
  screen: { x: number; y: number }
}

interface EdgeLabelEditorState {
  edgeId: string
  label: string
  x: number
  y: number
}

function statusLabel(status: SaveStatus): string {
  if (status === 'saved') return 'Saved'
  if (status === 'dirty') return 'Unsaved changes'
  if (status === 'saving') return 'Saving'
  if (status === 'conflict') return 'Conflict'
  return 'Save failed'
}

function makeTextNode(
  position: { x: number; y: number },
  width = 360,
  height = 200,
): TextNode {
  return {
    id: createNodeId(),
    type: 'text',
    x: Math.round(position.x),
    y: Math.round(position.y),
    width,
    height,
    text: '',
  }
}

function makeEntityNode(
  entityTypeId: string,
  position: { x: number; y: number },
  ontology: Ontology,
): CanvasNode | null {
  const entityType = findEntityType(ontology, entityTypeId)
  if (!entityType) return null
  const fields = emptyEntityFields(entityType)
  return {
    id: createNodeId(),
    type: 'text',
    x: Math.round(position.x),
    y: Math.round(position.y),
    width: entityType.defaultSize.width,
    height: entityType.defaultSize.height,
    text: renderEntityMarkdown(entityType, fields),
    skyward: { entityType: entityType.id, fields },
  } as CanvasNode
}

function clientPoint(event: { clientX: number; clientY: number } | TouchEvent): { x: number; y: number } {
  if ('clientX' in event) return { x: event.clientX, y: event.clientY }
  const touch = event.changedTouches[0]
  return { x: touch?.clientX ?? 0, y: touch?.clientY ?? 0 }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

function CanvasEditorInner({ client, document, onBack }: CanvasEditorProps) {
  const ontology = useOntology()
  const initial = useMemo(() => toFlowCanvas(document.canvas, ontology), [document, ontology])
  const savedViewport = useMemo(() => readViewport(document.id), [document.id])
  const history = useCanvasHistory(initial)
  const {
    canRedo,
    canUndo,
    observe: observeHistory,
    redo: redoHistory,
    reset: resetHistory,
    undo: undoHistory,
  } = history
  const [nodes, setNodes] = useState<CanvasFlowNode[]>(initial.nodes)
  const [edges, setEdges] = useState<CanvasFlowEdge[]>(initial.edges)
  const [baseCanvas, setBaseCanvas] = useState<JsonCanvas>(document.canvas)
  const [etag, setEtag] = useState(document.etag)
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState<SaveStatus>('saved')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [conflicts, setConflicts] = useState<MergeConflict[]>([])
  const [pendingLocal, setPendingLocal] = useState<JsonCanvas | null>(null)
  const [newRelationType, setNewRelationType] = useState('relates_to')
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null)
  const [edgeLabelEditor, setEdgeLabelEditor] = useState<EdgeLabelEditorState | null>(null)
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuide[]>([])
  const flowRef = useRef<HTMLDivElement>(null)
  const nodesRef = useRef(nodes)
  const { screenToFlowPosition, fitView, getZoom } = useReactFlow()

  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])

  const markDirty = useCallback(() => {
    setDirty(true)
    setStatus('dirty')
    setNotice('')
  }, [])

  useEffect(() => observeHistory({ nodes, edges }), [edges, nodes, observeHistory])

  const updateText = useCallback((id: string, text: string) => {
    setNodes((current) => current.map((node) => node.id === id
      ? { ...node, data: { ...node.data, text, raw: { ...node.data.raw, text } } }
      : node))
    markDirty()
  }, [markDirty])

  const updateLabel = useCallback((id: string, label: string) => {
    setNodes((current) => current.map((node) => node.id === id
      ? { ...node, data: { ...node.data, label, raw: { ...node.data.raw, label } } }
      : node))
    markDirty()
  }, [markDirty])

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
          raw: { ...node.data.raw, skyward: entity, text },
        },
      }
    }))
    markDirty()
  }, [markDirty, ontology])

  const resizeNode = useCallback((id: string, width: number, height: number) => {
    setNodes((current) => current.map((node) => node.id === id
      ? {
        ...node,
        style: { ...node.style, width, height },
        data: { ...node.data, raw: { ...node.data.raw, width, height } },
      }
      : node))
    markDirty()
  }, [markDirty])

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
      skyward: { groupMembers: selected.map((node) => node.id) },
    } as CanvasNode
    setNodes((current) => [
      { ...toFlowNode(groupRaw), selected: true },
      ...current.map((node) => ({ ...node, selected: false })),
    ])
    setEdges((current) => current.map((edge) => ({ ...edge, selected: false })))
    setSelectedEdgeId(null)
    markDirty()
  }, [markDirty, nodes])

  const deleteSelected = useCallback(() => {
    const selectedNodeIds = new Set(nodes.filter((node) => node.selected).map((node) => node.id))
    const selectedEdgeIds = new Set(edges.filter((edge) => edge.selected).map((edge) => edge.id))
    if (selectedNodeIds.size === 0 && selectedEdgeIds.size === 0) return
    setNodes((current) => current.filter((node) => !selectedNodeIds.has(node.id)))
    setEdges((current) => current.filter((edge) =>
      !selectedEdgeIds.has(edge.id)
      && !selectedNodeIds.has(edge.source)
      && !selectedNodeIds.has(edge.target)))
    setSelectedEdgeId(null)
    markDirty()
  }, [edges, markDirty, nodes])

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
  }, [markDirty])

  const currentCanvas = useCallback(
    (nodeList = nodes, edgeList = edges, base = baseCanvas) =>
      fromFlowCanvas(nodeList, edgeList, base),
    [baseCanvas, edges, nodes],
  )

  const undo = useCallback(() => {
    const snapshot = undoHistory({ nodes, edges })
    if (!snapshot) return
    setNodes(snapshot.nodes)
    setEdges(snapshot.edges)
    markDirty()
  }, [edges, markDirty, nodes, undoHistory])

  const redo = useCallback(() => {
    const snapshot = redoHistory({ nodes, edges })
    if (!snapshot) return
    setNodes(snapshot.nodes)
    setEdges(snapshot.edges)
    markDirty()
  }, [edges, markDirty, nodes, redoHistory])

  const selectAll = useCallback(() => {
    setNodes((current) => current.map((node) => ({ ...node, selected: true })))
    setEdges((current) => current.map((edge) => ({ ...edge, selected: true })))
  }, [])

  const clearSelection = useCallback(() => {
    setNodes((current) => current.map((node) => ({ ...node, selected: false })))
    setEdges((current) => current.map((edge) => ({ ...edge, selected: false })))
  }, [])

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
          raw.skyward = {
            ...(raw.skyward ?? {}),
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

    setNodes((current) => [
      ...current.map((node) => ({ ...node, selected: false })),
      ...nodeClones,
    ])
    setEdges((current) => [
      ...current.map((edge) => ({ ...edge, selected: false })),
      ...edgeClones,
    ])
    markDirty()
  }, [edges, markDirty, nodes])

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
  }, [markDirty, nodes])

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

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) return
      const modifier = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()

      if (!modifier && event.key === '?') {
        event.preventDefault()
        event.stopPropagation()
        setHelpOpen(true)
        return
      }
      if (modifier && key === 'z') {
        event.preventDefault()
        event.stopPropagation()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if (modifier && key === 'y') {
        event.preventDefault()
        event.stopPropagation()
        redo()
        return
      }
      if (modifier && key === 'd') {
        event.preventDefault()
        event.stopPropagation()
        duplicateSelection()
        return
      }
      if (modifier && key === 'a') {
        event.preventDefault()
        event.stopPropagation()
        selectAll()
        return
      }
      if (modifier && key === 'g') {
        event.preventDefault()
        event.stopPropagation()
        groupSelected()
        return
      }
      if (!modifier && event.shiftKey && event.code === 'Digit1') {
        event.preventDefault()
        event.stopPropagation()
        fitCanvas()
        return
      }
      if (!modifier && event.shiftKey && event.code === 'Digit2') {
        event.preventDefault()
        event.stopPropagation()
        zoomSelection()
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        if (helpOpen) {
          setHelpOpen(false)
        } else if (pendingConnection) {
          setPendingConnection(null)
        } else if (edgeLabelEditor) {
          setEdgeLabelEditor(null)
        } else {
          clearSelection()
        }
        return
      }
      if (event.key.startsWith('Arrow')) {
        event.preventDefault()
        event.stopPropagation()
        const step = event.shiftKey ? 1 : 10
        if (event.key === 'ArrowLeft') nudgeSelection(-step, 0)
        if (event.key === 'ArrowRight') nudgeSelection(step, 0)
        if (event.key === 'ArrowUp') nudgeSelection(0, -step)
        if (event.key === 'ArrowDown') nudgeSelection(0, step)
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [
    clearSelection,
    duplicateSelection,
    edgeLabelEditor,
    fitCanvas,
    groupSelected,
    helpOpen,
    nudgeSelection,
    pendingConnection,
    redo,
    selectAll,
    undo,
    zoomSelection,
  ])

  const save = useCallback(async (canvasOverride?: JsonCanvas, etagOverride?: string) => {
    const local = canvasOverride ?? currentCanvas()
    setStatus('saving')
    setError('')
    try {
      const saved = await client.saveCanvas(document.id, etagOverride ?? etag, local)
      setEtag(saved.etag)
      setBaseCanvas(saved.canvas)
      setDirty(false)
      setStatus('saved')
      setNotice('')
      setConflicts([])
      setPendingLocal(null)
    } catch (cause) {
      if (cause instanceof CanvasConflictError) {
        const merged = mergeCanvas(baseCanvas, local, cause.latest.canvas)
        const flow = toFlowCanvas(merged.canvas, ontology)
        setNodes(flow.nodes)
        setEdges(flow.edges)
        resetHistory(flow)
        setBaseCanvas(cause.latest.canvas)
        setEtag(cause.latest.etag)
        setPendingLocal(local)
        if (merged.conflicts.length > 0) {
          setConflicts(merged.conflicts)
          setDirty(false)
          setStatus('conflict')
          setNotice('Another editor changed the same content. Choose a resolution.')
        } else {
          setConflicts([])
          setDirty(true)
          setStatus('dirty')
          setNotice('Merged changes from another editor. Saving again.')
        }
        return
      }
      setError(cause instanceof Error ? cause.message : 'Could not save the canvas.')
      setStatus('error')
    }
  }, [baseCanvas, client, currentCanvas, document.id, etag, ontology, resetHistory])

  useEffect(() => {
    if (!dirty || status === 'saving' || conflicts.length > 0) return
    const timer = window.setTimeout(() => {
      void save()
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [baseCanvas, dirty, edges, nodes, save, status, conflicts.length])

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
  }, [getZoom, markDirty])

  const onEdgesChange = useCallback((changes: EdgeChange<CanvasFlowEdge>[]) => {
    setEdges((current) => applyEdgeChanges(changes, current))
    const material = changes.some((change) =>
      change.type === 'remove'
      || change.type === 'add'
      || change.type === 'replace')
    if (material) markDirty()
  }, [markDirty])

  const addCard = useCallback((position = { x: 120, y: 120 }) => {
    const raw = makeTextNode(position)
    setNodes((current) => [
      ...current.map((node) => ({ ...node, selected: false })),
      { ...toFlowNode(raw), selected: true },
    ])
    markDirty()
  }, [markDirty])

  const addEntity = useCallback((entityTypeId: string, position = { x: 120, y: 120 }) => {
    const raw = makeEntityNode(entityTypeId, position, ontology)
    if (!raw) return
    setNodes((current) => [
      ...current.map((node) => ({ ...node, selected: false })),
      { ...toFlowNode(raw), selected: true },
    ])
    markDirty()
  }, [markDirty, ontology])

  const onConnect = useCallback((connection: Connection) => {
    const raw = edgeFromConnection(connection, newRelationType, ontology)
    setEdges((current) => addEdge(toFlowEdge(raw, ontology), current))
    markDirty()
  }, [markDirty, newRelationType, ontology])

  const onConnectEnd = useCallback((
    event: { clientX: number; clientY: number } | TouchEvent,
    state: FinalConnectionState,
  ) => {
    if (state.toNode || !state.fromNode) return
    const bounds = flowRef.current?.getBoundingClientRect()
    if (!bounds) return
    const point = clientPoint(event)
    setPendingConnection({
      fromNodeId: state.fromNode.id,
      fromSide: state.fromPosition as CanvasNodeSide,
      position: { x: state.to.x, y: state.to.y },
      screen: {
        x: clamp(point.x - bounds.left, 8, bounds.width - 250),
        y: clamp(point.y - bounds.top, 8, bounds.height - 350),
      },
    })
    setEdgeLabelEditor(null)
  }, [])

  const insertConnectedNode = useCallback((templateId: string) => {
    const pending = pendingConnection
    if (!pending) return
    const entityType = templateId === 'text'
      ? undefined
      : findEntityType(ontology, templateId)
    const width = templateId === 'text' ? 360 : entityType?.defaultSize.width
    const height = templateId === 'text' ? 200 : entityType?.defaultSize.height
    if (!width || !height) return

    const bounds = flowRef.current?.getBoundingClientRect()
    let left = pending.position.x - width / 2
    let top = pending.position.y - height / 2
    if (bounds) {
      const visibleTopLeft = screenToFlowPosition({ x: bounds.left, y: bounds.top })
      const visibleBottomRight = screenToFlowPosition({ x: bounds.right, y: bounds.bottom })
      left = clamp(left, visibleTopLeft.x + 16, visibleBottomRight.x - width - 16)
      top = clamp(top, visibleTopLeft.y + 16, visibleBottomRight.y - height - 16)
    }
    const topLeft = { x: left, y: top }
    const raw = templateId === 'text'
      ? makeTextNode(topLeft, width, height)
      : makeEntityNode(templateId, topLeft, ontology)
    if (!raw) return

    const edge = edgeFromConnection({
      source: pending.fromNodeId,
      target: raw.id,
      sourceHandle: pending.fromSide,
      targetHandle: OPPOSITE_SIDE[pending.fromSide],
    }, newRelationType, ontology)

    setPendingConnection(null)
    setNodes((current) => [
      ...current.map((node) => ({ ...node, selected: false })),
      { ...toFlowNode(raw), selected: true },
    ])
    setEdges((current) => [...current, toFlowEdge(edge, ontology)])
    setSelectedEdgeId(null)
    markDirty()
  }, [markDirty, newRelationType, ontology, pendingConnection, screenToFlowPosition])

  const selectEdge = useCallback((id: string) => {
    setNodes((current) => current.map((node) => ({ ...node, selected: false })))
    setEdges((current) => current.map((edge) => ({ ...edge, selected: edge.id === id })))
    setSelectedEdgeId(id)
  }, [])

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
  }, [edges])

  const actions = useMemo<CanvasEditorActions>(
    () => ({
      updateText,
      updateLabel,
      updateEntityField,
      resizeNode,
      editEdgeLabel: openEdgeLabelEditor,
      selectEdge,
    }),
    [openEdgeLabelEditor, resizeNode, selectEdge, updateEntityField, updateLabel, updateText],
  )

  const onReconnect = useCallback((oldEdge: CanvasFlowEdge, connection: Connection) => {
    setEdges((current) => current.map((edge) =>
      edge.id === oldEdge.id ? reconnectFlowEdge(edge, connection) : edge))
    markDirty()
  }, [markDirty])

  const reverseSelectedEdges = useCallback(() => {
    if (!edges.some((edge) => edge.selected)) return
    setEdges((current) => current.map((edge) =>
      edge.selected ? reverseFlowEdge(edge) : edge))
    markDirty()
  }, [edges, markDirty])

  function saveEdgeLabel(value: string) {
    const editor = edgeLabelEditor
    if (!editor) return
    setEdges((current) => current.map((edge) =>
      edge.id === editor.edgeId ? applyLabelToFlowEdge(edge, value) : edge))
    setEdgeLabelEditor(null)
    markDirty()
  }

  const selectedNodes = nodes.filter((node) => node.selected)
  const selectedEdges = edges.filter((edge) => edge.selected)
  const singleSelectedNode = selectedNodes.length === 1 ? selectedNodes[0] : undefined
  const cardTypeValue = singleSelectedNode && singleSelectedNode.type !== 'group'
    ? singleSelectedNode.data.entity?.entityType ?? 'text'
    : undefined

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

  function toggleGroupMembership() {
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
        skyward: { ...(node.data.raw.skyward ?? {}), groupMembers: nextMembers },
      } as CanvasNode
      return { ...node, data: { ...node.data, raw } }
    }))
    markDirty()
  }

  function handleDoubleClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement
    if (!target.classList.contains('react-flow__pane')) return
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY })
    addCard(position)
  }

  function centerPosition(width = 360, height = 200): { x: number; y: number } {
    const bounds = flowRef.current?.getBoundingClientRect()
    const position = screenToFlowPosition({
      x: (bounds?.left ?? 0) + (bounds?.width ?? window.innerWidth) / 2,
      y: (bounds?.top ?? 0) + (bounds?.height ?? window.innerHeight) / 2,
    })
    return { x: position.x - width / 2, y: position.y - height / 2 }
  }

  function addAtCenter() {
    addCard(centerPosition())
  }

  function addEntityAtCenter(entityTypeId: string) {
    const entityType = findEntityType(ontology, entityTypeId)
    if (!entityType) return
    addEntity(entityTypeId, centerPosition(entityType.defaultSize.width, entityType.defaultSize.height))
  }

  async function reloadLatest() {
    setError('')
    try {
      const latest = await client.getCanvas(document.id)
      const flow = toFlowCanvas(latest.canvas, ontology)
      setNodes(flow.nodes)
      setEdges(flow.edges)
      resetHistory(flow)
      setBaseCanvas(latest.canvas)
      setEtag(latest.etag)
      setConflicts([])
      setPendingLocal(null)
      setDirty(false)
      setStatus('saved')
      setNotice('Loaded the latest saved canvas.')
      window.setTimeout(() => fitView({ padding: 0.25, maxZoom: 1.2 }), 0)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not reload the canvas.')
      setStatus('error')
    }
  }

  async function keepMine() {
    const local = pendingLocal ?? currentCanvas()
    setConflicts([])
    await save(local, etag)
  }

  function changeRelation(relationTypeId: string) {
    if (!selectedEdgeId) {
      setNewRelationType(relationTypeId)
      return
    }
    setEdges((current) => current.map((edge) =>
      edge.id === selectedEdgeId ? applyRelationToFlowEdge(edge, relationTypeId, ontology) : edge))
    markDirty()
  }

  const selectedEdge = selectedEdgeId
    ? edges.find((edge) => edge.id === selectedEdgeId)
    : undefined
  const relationValue = selectedEdge
    ? selectedEdge.data?.relationType ?? 'relates_to'
    : newRelationType

  async function download() {
    setError('')
    try {
      await client.downloadCanvas(document.id, document.title)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not download the canvas.')
    }
  }

  async function back() {
    if (dirty) await save()
    onBack()
  }

  return (
    <CanvasEditorActionsContext.Provider value={actions}>
      <div className="editor-shell">
        <div className="editor-toolbar">
          <button className="button ghost" onClick={back}>
            <ArrowLeft size={16} />
            All canvases
          </button>
          <div className="editor-toolbar-title">
            <h1>{document.title}</h1>
            <span className={`save-status ${status}`}>{statusLabel(status)}</span>
          </div>
          <div className="editor-actions">
            <button
              className="icon-button"
              aria-label="Undo"
              title="Undo"
              onClick={undo}
              disabled={!canUndo}
            >
              <Undo2 size={15} />
            </button>
            <button
              className="icon-button"
              aria-label="Redo"
              title="Redo"
              onClick={redo}
              disabled={!canRedo}
            >
              <Redo2 size={15} />
            </button>
            <button
              className="icon-button"
              aria-label="Keyboard shortcuts"
              title="Keyboard shortcuts"
              onClick={() => setHelpOpen(true)}
            >
              <Keyboard size={15} />
            </button>
            <label className="toolbar-field">
              <span>{selectedEdge ? 'Edge relation' : 'New edge'}</span>
              <select
                className="template-select"
                value={relationValue}
                onChange={(event) => changeRelation(event.target.value)}
              >
                {ontology.relationTypes.map((relationType) => (
                  <option key={relationType.id} value={relationType.id}>{relationType.label}</option>
                ))}
              </select>
            </label>
            <button className="button" onClick={addAtCenter}>
              <Plus size={16} />
              Add card
            </button>
            <select
              className="template-select"
              aria-label="Add template"
              defaultValue=""
              onChange={(event) => {
                const value = event.target.value
                if (value) addEntityAtCenter(value)
                event.target.value = ''
              }}
            >
              <option value="">Add template</option>
              {ontology.entityTypes.map((entityType) => (
                <option key={entityType.id} value={entityType.id}>{entityType.label}</option>
              ))}
            </select>
            <button className="button" onClick={() => void save()} disabled={status === 'saving'}>
              <Save size={16} />
              {status === 'saving' ? 'Saving' : 'Save'}
            </button>
            <button className="button" onClick={download}>
              <Download size={16} />
              .canvas
            </button>
          </div>
        </div>

        {notice && (
          <div className="editor-notice" role="status">
            <span>{notice}</span>
            <button className="icon-button" onClick={() => setNotice('')} aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        )}

        {error && <div className="alert editor-alert" role="alert">{error}</div>}

        <div className="canvas-flow" ref={flowRef} onDoubleClick={handleDoubleClick}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onConnectStart={() => {
              setPendingConnection(null)
              setEdgeLabelEditor(null)
              setAlignmentGuides([])
            }}
            onConnectEnd={onConnectEnd}
            onEdgeDoubleClick={(event, edge) => {
              openEdgeLabelEditor(edge.id, event.clientX, event.clientY)
            }}
            onReconnect={onReconnect}
            edgesReconnectable
            reconnectRadius={14}
            onNodeDragStart={() => setAlignmentGuides([])}
            onNodeDragStop={() => setAlignmentGuides([])}
            onMoveStart={() => setAlignmentGuides([])}
            onSelectionChange={({ edges: selectedEdgeList }) => {
              setSelectedEdgeId(selectedEdgeList[0]?.id ?? null)
            }}
            connectionMode={ConnectionMode.Loose}
            fitView={!savedViewport}
            fitViewOptions={{ padding: 0.25, maxZoom: 1.2 }}
            defaultViewport={savedViewport ?? undefined}
            onMoveEnd={(_, viewport: Viewport) => writeViewport(document.id, viewport)}
            minZoom={0.2}
            maxZoom={2.5}
            zoomOnDoubleClick={false}
            panOnScroll
            panActivationKeyCode="Space"
            zoomActivationKeyCode={['Meta', 'Control']}
            multiSelectionKeyCode="Shift"
            selectionOnDrag
            panOnDrag={[1, 2]}
            deleteKeyCode={['Backspace', 'Delete']}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="rgba(255, 255, 255, 0.09)" />
            <Controls showInteractive={false} />
            <ViewportPortal>
              {alignmentGuides.map((guide, index) => (
                <div
                  key={`${guide.axis}-${guide.position}-${index}`}
                  className={`alignment-guide ${guide.axis}`}
                  style={guide.axis === 'x'
                    ? { left: guide.position, top: guide.start, height: guide.end - guide.start }
                    : { top: guide.position, left: guide.start, width: guide.end - guide.start }}
                />
              ))}
            </ViewportPortal>
          </ReactFlow>
          <button
            className="canvas-help-hint"
            onClick={() => setHelpOpen(true)}
            aria-label="Show shortcuts help"
          >
            ? Shortcuts
          </button>
          {!pendingConnection && !edgeLabelEditor && (
            <SelectionToolbar
              selectedNodes={selectedNodes.length}
              selectedEdges={selectedEdges.length}
              canGroup={selectedNodes.some((node) => node.type !== 'group')}
              cardTypeValue={cardTypeValue}
              onCardTypeChange={changeCardType}
              onGroup={groupSelected}
              onReverse={reverseSelectedEdges}
              canManageMembership={canManageMembership}
              membershipLabel={allSelectedCardsAreMembers ? 'Remove from group' : 'Add to group'}
              onToggleMembership={toggleGroupMembership}
              onDuplicate={duplicateSelection}
              onDelete={deleteSelected}
              onColor={applyColor}
            />
          )}
          {pendingConnection && (
            <ConnectionTemplateMenu
              x={pendingConnection.screen.x}
              y={pendingConnection.screen.y}
              onSelect={insertConnectedNode}
              onClose={() => setPendingConnection(null)}
            />
          )}
          {edgeLabelEditor && (
            <EdgeLabelEditor
              x={edgeLabelEditor.x}
              y={edgeLabelEditor.y}
              initialValue={edgeLabelEditor.label}
              onSave={saveEdgeLabel}
              onCancel={() => setEdgeLabelEditor(null)}
            />
          )}
        </div>

        {conflicts.length > 0 && (
          <div className="conflict-bar" role="alertdialog" aria-label="Merge conflict">
            <div>
              <strong>Merge conflict</strong>
              <span>
                {conflicts.length} item{conflicts.length === 1 ? '' : 's'} changed in both places.
              </span>
            </div>
            <button className="button" onClick={() => void reloadLatest()}>Reload latest</button>
            <button className="button primary" onClick={() => void keepMine()}>Keep my version</button>
          </div>
        )}

        <KeyboardShortcutsDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      </div>
    </CanvasEditorActionsContext.Provider>
  )
}

export function CanvasEditor(props: CanvasEditorProps) {
  return (
    <ReactFlowProvider>
      <CanvasEditorInner {...props} />
    </ReactFlowProvider>
  )
}
