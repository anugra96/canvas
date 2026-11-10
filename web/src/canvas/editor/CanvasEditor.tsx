import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  Position,
  ReactFlow,
  ReactFlowProvider,
  ViewportPortal,
  type Viewport,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  getNodesBounds,
  getViewportForBounds,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type FinalConnectionState,
  type NodeChange,
} from '@xyflow/react'
import { X } from 'lucide-react'
import { toPng } from 'html-to-image'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from 'react'

import {
  createNodeId,
  emptyEntityFields,
  getCanvasLinks,
  findEntityType,
  getGroupMembers,
  mergeCanvas,
  renderEntityMarkdown,
  type CanvasDocument,
  type CanvasLink,
  type CanvasNode,
  type CanvasSummary,
  type CanvasNodeSide,
  type CanvasProfileIssue,
  type EntityFields,
  type JsonCanvas,
  type MergeConflict,
  type Ontology,
  type TextNode,
} from '@canvas/contract'

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
import { autoLayoutCanvas, dataFlowLayoutCanvas } from '../model/autoLayout'
import { getCanvasEdgePath } from '../model/edgePath'
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
import { useCoarsePointer, useIsMobile } from '../../useMediaQuery'
import { findBestCardSize } from './autoFit'
import { CanvasEditorActionsContext, type CanvasEditorActions } from './CanvasEditorContext'
import { CanvasBackdrop } from '../backdrop/CanvasBackdrop'
import { CanvasValidationContext } from './CanvasValidationContext'
import { CanvasToolbar, type SaveStatus } from './CanvasToolbar'
import { ConnectionTemplateMenu } from './ConnectionTemplateMenu'
import { ProfileValidationTray } from './ProfileValidationTray'
import { CanvasIntelligencePanel } from './CanvasIntelligencePanel'
import { EdgeLabelEditor } from './EdgeLabelEditor'
import { KeyboardShortcutsDialog } from './KeyboardShortcutsDialog'
import { CanvasNameDialog } from '../../CanvasNameDialog'
import { CanvasLinksDialog } from './CanvasLinksDialog'
import { DerivedViewsDialog } from './DerivedViewsDialog'
import { ScreenshotDialog } from './ScreenshotDialog'
import { NodeSizeDialog } from './NodeSizeDialog'
import { SelectionToolbar } from './SelectionToolbar'
import { isEditableTarget } from './shortcuts'
import { useCanvasHistory } from './useCanvasHistory'
import { useCanvasProfile } from './useCanvasProfile'
import { useProfileValidation } from './useProfileValidation'
import { prioritizeValidationIssues } from './prioritizeIssues'
import { buildSuggestions, type CanvasSuggestion } from '../suggestions/suggestionEngine'
import {
  createSuppression,
  readValidationSuppressions,
  withValidationSuppressions,
  type IgnoreReason,
  type ValidationSuppression,
} from './validationSuppressions'
import { validationIssueKey } from './validationIdentity'
import { readViewport, writeViewport } from './viewport'
import { CanvasEdge as CanvasEdgeComponent } from './edges/CanvasEdge'
import { createCanvasLink, withCanvasLinks } from '../model/canvasLinks'
import { CodeNode } from './nodes/CodeNode'
import { SchemaNode } from './nodes/SchemaNode'
import { EntityNode } from './nodes/EntityNode'
import { FileNode } from './nodes/FileNode'
import { GroupNode } from './nodes/GroupNode'
import { LinkNode } from './nodes/LinkNode'
import { TextNode as TextNodeComponent } from './nodes/TextNode'

const nodeTypes = {
  text: TextNodeComponent,
  entity: EntityNode,
  schema: SchemaNode,
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
  trail: Array<{ id: string; label: string }>
  onOpenTrail: (index: number) => void
  onOpenLinkedCanvas: (canvasId: string, label: string) => void
}

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

interface CardMenuState {
  screen: { x: number; y: number }
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
    app: { entityType: entityType.id, fields },
  } as CanvasNode
}

const SIDE_POSITION: Record<CanvasNodeSide, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
}

const OPPOSITE_POSITION: Record<CanvasNodeSide, Position> = {
  top: Position.Bottom,
  right: Position.Left,
  bottom: Position.Top,
  left: Position.Right,
}

function ConnectionPreview({
  nodes,
  pending,
}: {
  nodes: CanvasFlowNode[]
  pending: PendingConnection
}) {
  const source = nodes.find((node) => node.id === pending.fromNodeId)
  if (!source) return null
  const size = nodeDimensions(source)
  const sourceX = pending.fromSide === 'left'
    ? source.position.x
    : pending.fromSide === 'right'
      ? source.position.x + size.width
      : source.position.x + size.width / 2
  const sourceY = pending.fromSide === 'top'
    ? source.position.y
    : pending.fromSide === 'bottom'
      ? source.position.y + size.height
      : source.position.y + size.height / 2
  const path = getCanvasEdgePath({
    id: 'connection-preview',
    sourceX,
    sourceY,
    sourcePosition: SIDE_POSITION[pending.fromSide],
    targetX: pending.position.x,
    targetY: pending.position.y,
    targetPosition: OPPOSITE_POSITION[pending.fromSide],
  }).path

  return (
    <ViewportPortal>
      <svg className="connection-preview" aria-hidden="true">
        <path d={path} />
        <circle cx={pending.position.x} cy={pending.position.y} r={5} />
      </svg>
    </ViewportPortal>
  )
}

function clientPoint(event: { clientX: number; clientY: number } | TouchEvent): { x: number; y: number } {
  if ('clientX' in event) return { x: event.clientX, y: event.clientY }
  const touch = event.changedTouches[0]
  return { x: touch?.clientX ?? 0, y: touch?.clientY ?? 0 }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

function CanvasEditorInner({ client, document, onBack, trail, onOpenTrail, onOpenLinkedCanvas }: CanvasEditorProps) {
  const ontology = useOntology()
  const isMobile = useIsMobile()
  const coarsePointer = useCoarsePointer()
  const { profile, isSystems, availableEntityTypes, profileRelationTypes } = useCanvasProfile(ontology, document)
  const initial = useMemo(() => toFlowCanvas(document.canvas, ontology), [document, ontology])
  const viewportLayout = isMobile ? 'mobile' as const : 'desktop' as const
  const savedViewport = useMemo(() => readViewport(document.id, viewportLayout), [document.id, viewportLayout])
  const shouldFitInitial = useMemo(
    () => !savedViewport && (document.canvas.nodes?.length ?? 0) > 0,
    [document.canvas.nodes?.length, savedViewport],
  )
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
  const [title, setTitle] = useState(document.title)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameBusy, setRenameBusy] = useState(false)
  const [canvasLinkNodeId, setCanvasLinkNodeId] = useState<string | null>(null)
  const [canvasOptions, setCanvasOptions] = useState<CanvasSummary[]>([])
  const [canvasOptionsLoading, setCanvasOptionsLoading] = useState(false)
  const [canvasOptionsError, setCanvasOptionsError] = useState('')
  const [baseCanvas, setBaseCanvas] = useState<JsonCanvas>(document.canvas)
  const [etag, setEtag] = useState(document.etag)
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState<SaveStatus>('saved')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [conflicts, setConflicts] = useState<MergeConflict[]>([])
  const [pendingLocal, setPendingLocal] = useState<JsonCanvas | null>(null)
  const [newRelationType, setNewRelationType] = useState(isSystems ? '' : 'relates_to')
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [viewsOpen, setViewsOpen] = useState(false)
  const [validationPanel, setValidationPanel] = useState<'warnings' | 'intelligence' | null>(null)
  const [validationFocusRequest, setValidationFocusRequest] = useState<{ key: string; requestId: number } | null>(null)
  const validationRequestId = useRef(0)
  const [suppressions, setSuppressions] = useState<ValidationSuppression[]>(() => (
    readValidationSuppressions(document.canvas)
  ))
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null)
  const [cardMenu, setCardMenu] = useState<CardMenuState | null>(null)
  const [edgeLabelEditor, setEdgeLabelEditor] = useState<EdgeLabelEditorState | null>(null)
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuide[]>([])
  const [screenshotOpen, setScreenshotOpen] = useState(false)
  const [screenshotBusy, setScreenshotBusy] = useState(false)
  const [screenshotScale, setScreenshotScale] = useState(3)
  const [screenshotError, setScreenshotError] = useState('')
  const [areaMode, setAreaMode] = useState(false)
  const [connectNodeId, setConnectNodeId] = useState<string | null>(null)
  const [sizeDialogOpen, setSizeDialogOpen] = useState(false)
  const [dragBox, setDragBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const areaStart = useRef<{ clientX: number; clientY: number } | null>(null)
  const areaCurrent = useRef<{ clientX: number; clientY: number } | null>(null)
  const flowRef = useRef<HTMLDivElement>(null)
  const nodesRef = useRef(nodes)
  const { fitView, getViewport, getZoom } = useReactFlow()

  const clientToFlow = useCallback((clientX: number, clientY: number) => {
    const bounds = flowRef.current?.getBoundingClientRect()
    const viewport = getViewport()
    if (!bounds) return { x: clientX, y: clientY }
    return {
      x: (clientX - bounds.left - viewport.x) / viewport.zoom,
      y: (clientY - bounds.top - viewport.y) / viewport.zoom,
    }
  }, [getViewport])


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
          raw: { ...node.data.raw, app: entity, text },
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

  const autoFitNode = useCallback((id: string) => {
    const flowNode = nodes.find((node) => node.id === id)
    if (!flowNode || flowNode.type === 'group') return
    const wrapper = flowRef.current?.querySelector<HTMLElement>(`.react-flow__node[data-id="${id}"]`)
    const card = wrapper?.querySelector<HTMLElement>('.canvas-node')
    if (!card) return
    const size = nodeDimensions(flowNode)
    const next = findBestCardSize(card, size.width, size.height)
    resizeNode(id, next.width, next.height)
  }, [nodes, resizeNode])

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
      withValidationSuppressions(fromFlowCanvas(nodeList, edgeList, base), suppressions),
    [baseCanvas, edges, nodes, suppressions],
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
    setSelectedEdgeId(null)
    setConnectNodeId(null)
    setSizeDialogOpen(false)
  }, [])

  const autoLayout = useCallback(() => {
    const layout = autoLayoutCanvas(nodes, edges)
    setNodes(layout.nodes)
    setEdges(layout.edges)
    setAlignmentGuides([])
    setNotice('Architecture layout applied.')
    markDirty()
    window.setTimeout(() => {
      void fitView({ padding: 0.2, maxZoom: 1.2, duration: 300 })
    }, 0)
  }, [edges, fitView, markDirty, nodes])

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
    setNodes(nextNodes)
    setAlignmentGuides([])
    setNotice(fitted > 0 ? `Auto-fitted ${fitted} cards.` : 'All cards already fit their content.')
    markDirty()
  }, [markDirty, nodes])

  const dataFlowLayout = useCallback(() => {
    const layout = dataFlowLayoutCanvas(nodes, edges)
    setNodes(layout.nodes)
    setEdges(layout.edges)
    setAlignmentGuides([])
    setNotice('Data-flow layout applied. Schemas moved to the contract rail.')
    markDirty()
    window.setTimeout(() => {
      void fitView({ padding: 0.2, maxZoom: 1.2, duration: 300 })
    }, 0)
  }, [edges, fitView, markDirty, nodes])

  const screenshotDimensions = useCallback((bounds: { width: number; height: number }) => {
    const longEdge = 1600
    const ratio = bounds.width / Math.max(bounds.height, 1)
    if (ratio >= 1) {
      return { width: longEdge, height: Math.max(240, Math.round(longEdge / ratio)) }
    }
    return { width: Math.max(240, Math.round(longEdge * ratio)), height: longEdge }
  }, [])

  const captureBounds = useCallback(async (
    bounds: { x: number; y: number; width: number; height: number },
    suffix: string,
    padding: number,
  ) => {
    const viewport = flowRef.current?.querySelector<HTMLElement>('.react-flow__viewport')
    if (!viewport) throw new Error('Canvas viewport is not available.')
    if (bounds.width <= 0 || bounds.height <= 0) throw new Error('The selected area is too small.')
    const { width, height } = screenshotDimensions(bounds)
    const transform = getViewportForBounds(bounds, width, height, 0.01, 4, padding)
    const background = flowRef.current
      ? getComputedStyle(flowRef.current).backgroundColor
      : '#ffffff'

    clearSelection()
    setSelectedEdgeId(null)
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })

    const dataUrl = await toPng(viewport, {
      width,
      height,
      pixelRatio: screenshotScale,
      backgroundColor: background,
      cacheBust: true,
      style: {
        width: `${width}px`,
        height: `${height}px`,
        transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.zoom})`,
        transformOrigin: '0 0',
      },
    })

    const safeTitle = title.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'canvas'
    const link = window.document.createElement('a')
    link.download = `${safeTitle}-${suffix}.png`
    link.href = dataUrl
    link.click()
  }, [clearSelection, screenshotDimensions, screenshotScale, title])

  const captureFull = useCallback(async () => {
    if (nodes.length === 0) {
      setScreenshotError('Add a card before capturing the canvas.')
      return
    }
    setScreenshotBusy(true)
    setScreenshotError('')
    try {
      await captureBounds(getNodesBounds(nodes), 'full', 0.05)
      setScreenshotOpen(false)
      setNotice('Screenshot downloaded.')
    } catch (cause) {
      setScreenshotError(cause instanceof Error ? cause.message : 'Could not create the screenshot.')
    } finally {
      setScreenshotBusy(false)
    }
  }, [captureBounds, nodes])

  const beginAreaSelection = useCallback(() => {
    setScreenshotOpen(false)
    setScreenshotError('')
    setAreaMode(true)
    setDragBox(null)
    setHelpOpen(false)
    setPendingConnection(null)
    setCardMenu(null)
    setEdgeLabelEditor(null)
    setAlignmentGuides([])
    clearSelection()
    setSelectedEdgeId(null)
    setConnectNodeId(null)
  }, [clearSelection])

  const cancelAreaSelection = useCallback(() => {
    setAreaMode(false)
    setDragBox(null)
    areaStart.current = null
    areaCurrent.current = null
  }, [])

  useEffect(() => {
    if (!areaMode) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') cancelAreaSelection()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [areaMode, cancelAreaSelection])

  const onAreaPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    const rect = event.currentTarget.getBoundingClientRect()
    areaStart.current = { clientX: event.clientX, clientY: event.clientY }
    areaCurrent.current = { clientX: event.clientX, clientY: event.clientY }
    setDragBox({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      width: 0,
      height: 0,
    })
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [])

  const onAreaPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!areaStart.current) return
    const rect = event.currentTarget.getBoundingClientRect()
    const start = areaStart.current
    areaCurrent.current = { clientX: event.clientX, clientY: event.clientY }
    setDragBox({
      x: Math.min(start.clientX, event.clientX) - rect.left,
      y: Math.min(start.clientY, event.clientY) - rect.top,
      width: Math.abs(event.clientX - start.clientX),
      height: Math.abs(event.clientY - start.clientY),
    })
  }, [])

  const onAreaPointerUp = useCallback(async (event: PointerEvent<HTMLDivElement>) => {
    const start = areaStart.current
    if (!start) return
    const end = { clientX: event.clientX, clientY: event.clientY }
    areaStart.current = null
    areaCurrent.current = null
    setDragBox(null)
    const startFlow = clientToFlow(start.clientX, start.clientY)
    const endFlow = clientToFlow(end.clientX, end.clientY)
    const bounds = {
      x: Math.min(startFlow.x, endFlow.x),
      y: Math.min(startFlow.y, endFlow.y),
      width: Math.abs(endFlow.x - startFlow.x),
      height: Math.abs(endFlow.y - startFlow.y),
    }
    if (bounds.width < 12 || bounds.height < 12) return
    setAreaMode(false)
    setScreenshotBusy(true)
    setNotice('Rendering screenshot...')
    try {
      await captureBounds(bounds, 'selection', 0.02)
      setNotice('Screenshot downloaded.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the screenshot.')
    } finally {
      setScreenshotBusy(false)
    }
  }, [captureBounds, clientToFlow])

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
        } else if (cardMenu) {
          setCardMenu(null)
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
    cardMenu,
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
      setSuppressions(readValidationSuppressions(saved.canvas))
      setDirty(false)
      setStatus('saved')
      setNotice('')
      setConflicts([])
      setPendingLocal(null)
      return saved
    } catch (cause) {
      if (cause instanceof CanvasConflictError) {
        const merged = mergeCanvas(baseCanvas, local, cause.latest.canvas)
        const flow = toFlowCanvas(merged.canvas, ontology)
        setNodes(flow.nodes)
        setEdges(flow.edges)
        resetHistory(flow)
        setBaseCanvas(cause.latest.canvas)
        setEtag(cause.latest.etag)
        setSuppressions(readValidationSuppressions(merged.canvas))
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
        return null
      }
      setError(cause instanceof Error ? cause.message : 'Could not save the canvas.')
      setStatus('error')
      return null
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
    if (isSystems && !newRelationType) raw.label = 'Define relation'
    setEdges((current) => addEdge(toFlowEdge(raw, ontology), current))
    setConnectNodeId(null)
    markDirty()
  }, [isSystems, markDirty, newRelationType, ontology])

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
    const raw = edgeFromConnection({ source: sourceId, target: targetId, sourceHandle, targetHandle }, newRelationType, ontology)
    if (isSystems && !newRelationType) raw.label = 'Define relation'
    setEdges((current) => addEdge(toFlowEdge(raw, ontology), current))
    setConnectNodeId(null)
    markDirty()
  }, [isSystems, markDirty, newRelationType, nodes, ontology])

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
  }, [clientToFlow])

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
    }, newRelationType, ontology)
    if (isSystems && !newRelationType) edge.label = 'Define relation'

    setPendingConnection(null)
    setNodes((current) => [
      ...current.map((node) => ({ ...node, selected: false })),
      { ...toFlowNode(raw), selected: true },
    ])
    setEdges((current) => [...current, toFlowEdge(edge, ontology)])
    setSelectedEdgeId(null)
    markDirty()
  }, [isSystems, markDirty, newRelationType, ontology, pendingConnection])

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

  const openCanvasLinks = useCallback(async (nodeId: string) => {
    setCanvasLinkNodeId(nodeId)
    setCanvasOptionsError('')
    setCanvasOptionsLoading(true)
    try {
      setCanvasOptions(await client.listCanvases())
    } catch (cause) {
      setCanvasOptionsError(cause instanceof Error ? cause.message : 'Could not load canvases.')
    } finally {
      setCanvasOptionsLoading(false)
    }
  }, [client])

  const updateCanvasLinks = useCallback((nodeId: string, update: (links: CanvasLink[]) => CanvasLink[]) => {
    setNodes((current) => current.map((node) => {
      if (node.id !== nodeId) return node
      return withCanvasLinks(node, update(getCanvasLinks(node.data.raw)))
    }))
    markDirty()
  }, [markDirty])

  const linkExistingCanvas = useCallback((canvasId: string) => {
    if (!canvasLinkNodeId) return
    updateCanvasLinks(canvasLinkNodeId, (links) => (
      links.some((link) => link.canvasId === canvasId)
        ? links
        : [...links, createCanvasLink(canvasId)]
    ))
  }, [canvasLinkNodeId, updateCanvasLinks])

  const unlinkCanvas = useCallback((linkId: string) => {
    if (!canvasLinkNodeId) return
    updateCanvasLinks(canvasLinkNodeId, (links) => links.filter((link) => link.id !== linkId))
  }, [canvasLinkNodeId, updateCanvasLinks])

  const relabelCanvas = useCallback((linkId: string, label: string) => {
    if (!canvasLinkNodeId) return
    updateCanvasLinks(canvasLinkNodeId, (links) => links.map((link) => (
      link.id === linkId
        ? { ...link, ...(label.trim() ? { label } : { label: undefined }) }
        : link
    )))
  }, [canvasLinkNodeId, updateCanvasLinks])

  async function createLinkedCanvas(title: string) {
    if (!canvasLinkNodeId) return
    const child = await client.createCanvas(title, profile.id)
    updateCanvasLinks(canvasLinkNodeId, (links) => [...links, createCanvasLink(child.id)])
    setCanvasOptions((current) => [...current, {
      id: child.id,
      title: child.title,
      etag: child.etag,
      updatedAt: child.updatedAt,
      updatedBy: child.updatedBy,
      nodeCount: child.nodeCount,
      edgeCount: child.edgeCount,
      profile: child.canvas.app?.profile ?? profile.id,
    }])
    setNotice(`Created and linked "${child.title}".`)
  }

  async function openLinkedCanvas(link: CanvasLink) {
    if (trail.some((entry) => entry.id === link.canvasId)) {
      throw new Error('That canvas is already open in the trail.')
    }
    if (dirty) {
      const saved = await save()
      if (!saved) throw new Error('Save the current canvas before opening a linked canvas.')
    }
    onOpenLinkedCanvas(link.canvasId, link.label ?? 'Linked canvas')
  }

  async function openTrail(index: number) {
    if (dirty) {
      const saved = await save()
      if (!saved) return
    }
    onOpenTrail(index)
  }

  const actions = useMemo<CanvasEditorActions>(
    () => ({
      updateText,
      updateLabel,
      updateEntityField,
      resizeNode,
      autoFitNode,
      editEdgeLabel: openEdgeLabelEditor,
      selectEdge,
      openCanvasLinks,
    }),
    [autoFitNode, openCanvasLinks, openEdgeLabelEditor, resizeNode, selectEdge, updateEntityField, updateLabel, updateText],
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
        app: { ...(node.data.raw.app ?? {}), groupMembers: nextMembers },
      } as CanvasNode
      return { ...node, data: { ...node.data, raw } }
    }))
    markDirty()
  }

  function handleDoubleClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement
    if (!target.classList.contains('react-flow__pane')) return
    const bounds = flowRef.current?.getBoundingClientRect()
    if (!bounds) return
    setPendingConnection(null)
    setEdgeLabelEditor(null)
    setCardMenu({
      screen: { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
    })
  }

  function insertCardFromMenu(templateId: string) {
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
    setNodes((current) => [
      ...current.map((node) => ({ ...node, selected: false })),
      { ...toFlowNode(raw), selected: true },
    ])
    markDirty()
  }

  function centerPosition(width = 360, height = 200): { x: number; y: number } {
    const bounds = flowRef.current?.getBoundingClientRect()
    const position = clientToFlow(
      (bounds?.left ?? 0) + (bounds?.width ?? window.innerWidth) / 2,
      (bounds?.top ?? 0) + (bounds?.height ?? window.innerHeight) / 2,
    )
    return { x: position.x - width / 2, y: position.y - height / 2 }
  }

  function placementPosition(width: number, height: number): {
    x: number
    y: number
    visible: boolean
  } {
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
  }

  function addAtCenter() {
    addCard(centerPosition(360, 200))
  }

  function revealPlacement(visible: boolean) {
    if (visible) return
    window.setTimeout(() => {
      void fitView({ padding: 0.25, maxZoom: 1 })
    }, 60)
  }

  function addNoteAtCenter() {
    const noteType = findEntityType(ontology, 'note')
    if (!noteType) return
    const placement = placementPosition(noteType.defaultSize.width, noteType.defaultSize.height)
    addEntity('note', placement)
    revealPlacement(placement.visible)
  }

  function addEntityAtCenter(entityTypeId: string) {
    const entityType = findEntityType(ontology, entityTypeId)
    if (!entityType) return
    if (!isSystems) {
      addEntity(entityTypeId, centerPosition(entityType.defaultSize.width, entityType.defaultSize.height))
      return
    }
    const placement = placementPosition(entityType.defaultSize.width, entityType.defaultSize.height)
    addEntity(entityTypeId, placement)
    revealPlacement(placement.visible)
  }

  async function addProcessWithCanvas() {
    const processType = findEntityType(ontology, 'process')
    const noteType = findEntityType(ontology, 'note')
    if (!processType || !noteType) return
    setError('')
    try {
      const child = await client.createCanvas('Process documentation', profile.id)
      const notes: Array<[string, string]> = [
        ['Purpose', 'Describe the process goal and trigger.'],
        ['Stages', 'Document stages, hand-offs, and owners.'],
        ['Approvals', 'Document manual approvals and gates.'],
        ['Failure handling', 'Document retries, rollback, and escalation.'],
      ]
      const nodes = notes.map(([name, body], index) => {
        const base = makeEntityNode('note', {
          x: 80 + (index % 2) * 380,
          y: 80 + Math.floor(index / 2) * 260,
        }, ontology)
        if (!base) throw new Error('Could not create process documentation notes.')
        const fields = { ...emptyEntityFields(noteType), name, body }
        return {
          ...base,
          app: { ...(base.app ?? {}), entityType: 'note', fields },
          text: renderEntityMarkdown(noteType, fields),
        } as CanvasNode
      })
      await client.saveCanvas(child.id, child.etag, { ...child.canvas, nodes, edges: [] })

      const placement = placementPosition(processType.defaultSize.width, processType.defaultSize.height)
      const base = makeEntityNode('process', placement, ontology)
      if (!base) return
      const fields = {
        ...emptyEntityFields(processType),
        name: 'Process',
        purpose: 'Document the process stages and decisions in the linked canvas.',
        mode: 'hybrid',
        status: 'planned',
      }
      const link = createCanvasLink(child.id, 'Process documentation')
      const raw = {
        ...base,
        app: {
          ...(base.app ?? {}),
          entityType: 'process',
          fields,
          canvasLinks: [link],
        },
        text: renderEntityMarkdown(processType, fields),
      } as CanvasNode
      setNodes((current) => [
        ...current.map((node) => ({ ...node, selected: false })),
        { ...toFlowNode(raw), selected: true },
      ])
      markDirty()
      setNotice(`Created process card and linked "${child.title}".`)
      revealPlacement(placement.visible)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the linked process canvas.')
    }
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
      setSuppressions(readValidationSuppressions(latest.canvas))
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
    setEdges((current) => current.map((edge) => {
      if (edge.id !== selectedEdgeId) return edge
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
  }

  const selectedEdge = selectedEdgeId
    ? edges.find((edge) => edge.id === selectedEdgeId)
    : undefined
  const relationValue = selectedEdge
    ? selectedEdge.data?.relationType ?? ''
    : newRelationType
  const allValidationIssues = useProfileValidation({
    nodes,
    edges,
    baseCanvas,
    profile,
    ontology,
    isSystems,
  })
  const suppressionByFingerprint = useMemo(
    () => new Map(suppressions.map((suppression) => [suppression.fingerprint, suppression])),
    [suppressions],
  )
  const validationIssues = useMemo(
    () => allValidationIssues.filter((issue) => !suppressionByFingerprint.has(validationIssueKey(issue))),
    [allValidationIssues, suppressionByFingerprint],
  )
  const ignoredValidationIssues = useMemo(
    () => allValidationIssues.filter((issue) => suppressionByFingerprint.has(validationIssueKey(issue))),
    [allValidationIssues, suppressionByFingerprint],
  )
  const prioritizedIssues = useMemo(
    () => prioritizeValidationIssues(validationIssues, nodes, edges),
    [edges, nodes, validationIssues],
  )
  const ignoredPrioritizedIssues = useMemo(
    () => prioritizeValidationIssues(ignoredValidationIssues, nodes, edges),
    [edges, ignoredValidationIssues, nodes],
  )
  const suggestions = useMemo(
    () => buildSuggestions(validationIssues, nodes, edges),
    [edges, nodes, validationIssues],
  )
  const ignoredReasons = useMemo(
    () => new Map([...suppressionByFingerprint].map(([fingerprint, suppression]) => (
      [fingerprint, suppression.reason]
    ))),
    [suppressionByFingerprint],
  )

  const ignoreValidationIssue = useCallback((issue: CanvasProfileIssue, reason: IgnoreReason) => {
    const suppression = createSuppression(issue, reason)
    setSuppressions((current) => (
      current.some((candidate) => candidate.fingerprint === suppression.fingerprint)
        ? current
        : [...current, suppression]
    ))
    setNotice(`Warning ignored: ${reason}.`)
    markDirty()
  }, [markDirty])

  const restoreValidationIssue = useCallback((issue: CanvasProfileIssue) => {
    const fingerprint = validationIssueKey(issue)
    setSuppressions((current) => current.filter((suppression) => suppression.fingerprint !== fingerprint))
    setNotice('Warning restored.')
    markDirty()
  }, [markDirty])

  function suggestedPlacement(
    target: CanvasFlowNode,
    width: number,
    height: number,
    nodeList: CanvasFlowNode[] = nodes,
  ): { x: number; y: number; sourceHandle: CanvasNodeSide; targetHandle: CanvasNodeSide } {
    const size = nodeDimensions(target)
    const gap = 90
    const candidates = [
      {
        x: target.position.x - width - gap,
        y: target.position.y + (size.height - height) / 2,
        sourceHandle: 'right' as const,
        targetHandle: 'left' as const,
      },
      {
        x: target.position.x + size.width + gap,
        y: target.position.y + (size.height - height) / 2,
        sourceHandle: 'left' as const,
        targetHandle: 'right' as const,
      },
      {
        x: target.position.x + (size.width - width) / 2,
        y: target.position.y - height - gap,
        sourceHandle: 'bottom' as const,
        targetHandle: 'top' as const,
      },
      {
        x: target.position.x + (size.width - width) / 2,
        y: target.position.y + size.height + gap,
        sourceHandle: 'top' as const,
        targetHandle: 'bottom' as const,
      },
    ]
    const isFree = (candidate: { x: number; y: number }) => nodeList.every((node) => {
      const nodeSize = nodeDimensions(node)
      return candidate.x + width + gap <= node.position.x
        || candidate.x >= node.position.x + nodeSize.width + gap
        || candidate.y + height + gap <= node.position.y
        || candidate.y >= node.position.y + nodeSize.height + gap
    })
    return candidates.find(isFree) ?? candidates[0]!
  }

  function focusSuggestion(suggestion: CanvasSuggestion) {
    const ids = new Set<string>()
    for (const item of suggestion.items) {
      for (const fix of item.action.fixes) ids.add(fix.targetId)
    }
    if (ids.size === 0) return
    setNotice('Moved to the affected area. Apply the fix when ready.')
    void fitView({
      nodes: [...ids].map((id) => ({ id })),
      padding: 0.35,
      maxZoom: 1.2,
      duration: 450,
    })
  }

  function applySuggestion(suggestion: CanvasSuggestion) {
    let nextNodes = nodes
    let nextEdges = edges
    const focusIds: string[] = []
    const addedIds: string[] = []

    for (const item of suggestion.items) {
      for (const fix of item.action.fixes) {
        const target = nextNodes.find((node) => node.id === fix.targetId)
        const entityType = findEntityType(ontology, fix.entityType)
        if (!target || !entityType) continue
        const targetEntityType = target.data.entity
          ? findEntityType(ontology, target.data.entity.entityType)
          : undefined
        const targetName = String(
          target.data.entity?.fields.name ?? target.data.entity?.fields.title ?? '',
        ).trim()
        const name = `${targetName || targetEntityType?.label || entityType.label} ${fix.nameSuffix}`
        const placement = suggestedPlacement(
          target,
          entityType.defaultSize.width,
          entityType.defaultSize.height,
          nextNodes,
        )
        const base = makeEntityNode(fix.entityType, placement, ontology)
        if (!base) continue
        const fields = { ...emptyEntityFields(entityType), name }
        const raw = {
          ...base,
          app: { ...(base.app ?? {}), fields },
          text: renderEntityMarkdown(entityType, fields),
        } as CanvasNode
        const newNode = toFlowNode(raw)
        const edge = edgeFromConnection({
          source: raw.id,
          target: target.id,
          sourceHandle: placement.sourceHandle,
          targetHandle: placement.targetHandle,
        }, fix.relationType, ontology)
        nextNodes = [...nextNodes, newNode]
        nextEdges = [...nextEdges, toFlowEdge(edge, ontology)]
        addedIds.push(newNode.id)
        focusIds.push(target.id, newNode.id)
      }
    }

    if (addedIds.length === 0) return
    const selectedId = addedIds.at(-1)
    nextNodes = nextNodes.map((node) => ({ ...node, selected: node.id === selectedId }))
    setNodes(nextNodes)
    setEdges(nextEdges)
    setSelectedEdgeId(null)
    setNotice(`Applied suggested fix: ${suggestion.title.toLowerCase()}.`)
    setValidationPanel(null)
    setValidationFocusRequest(null)
    markDirty()
    window.setTimeout(() => {
      void fitView({
        nodes: [...new Set(focusIds)].map((id) => ({ id })),
        padding: 0.35,
        maxZoom: 1.2,
        duration: 300,
      })
    }, 0)
  }


  function focusValidationIssue(issue: CanvasProfileIssue) {
    if (issue.nodeId) {
      setNodes((current) => current.map((node) => ({
        ...node,
        selected: node.id === issue.nodeId,
      })))
      setEdges((current) => current.map((edge) => ({ ...edge, selected: false })))
      setSelectedEdgeId(null)
      void fitView({ nodes: [{ id: issue.nodeId }], duration: 300, maxZoom: 1.5 })
    } else if (issue.edgeId) {
      selectEdge(issue.edgeId)
      const edge = edges.find((candidate) => candidate.id === issue.edgeId)
      if (edge) {
        void fitView({
          nodes: [{ id: edge.source }, { id: edge.target }],
          duration: 300,
          maxZoom: 1.5,
        })
      }
    }
  }

  const nodeIssues = new Map<string, CanvasProfileIssue[]>()
  const edgeIssues = new Map<string, CanvasProfileIssue[]>()
  for (const issue of validationIssues) {
    if (issue.nodeId) {
      const list = nodeIssues.get(issue.nodeId) ?? []
      list.push(issue)
      nodeIssues.set(issue.nodeId, list)
    }
    if (issue.edgeId) {
      const list = edgeIssues.get(issue.edgeId) ?? []
      list.push(issue)
      edgeIssues.set(issue.edgeId, list)
    }
  }
  function openValidationIssue(issue: CanvasProfileIssue) {
    focusValidationIssue(issue)
    validationRequestId.current += 1
    setValidationFocusRequest({
      key: validationIssueKey(issue),
      requestId: validationRequestId.current,
    })
    setValidationPanel('warnings')
  }

  const validation = {
    nodeIssues,
    edgeIssues,
    openIssue: openValidationIssue,
  }

  async function renameCanvas(nextTitle: string) {
    setRenameBusy(true)
    setError('')
    try {
      let currentEtag = etag
      if (dirty) {
        const saved = await save()
        if (!saved) return
        currentEtag = saved.etag
      }
      const renamed = await client.renameCanvas(document.id, nextTitle, currentEtag)
      setTitle(renamed.title)
      setEtag(renamed.etag)
      setBaseCanvas(renamed.canvas)
      setRenameOpen(false)
      setNotice('Canvas renamed.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not rename the canvas.')
    } finally {
      setRenameBusy(false)
    }
  }

  async function download() {
    setError('')
    try {
      await client.downloadCanvas(document.id, title)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not download the canvas.')
    }
  }

  async function back() {
    if (dirty) await save()
    onBack()
  }

  const canvasLinkNode = canvasLinkNodeId
    ? nodes.find((node) => node.id === canvasLinkNodeId)
    : undefined
  const canvasLinkNodeName = (() => {
    if (!canvasLinkNode) return 'Card'
    const fields = canvasLinkNode.data.entity?.fields ?? {}
    return String(
      fields.name
      ?? fields.title
      ?? canvasLinkNode.data.label
      ?? canvasLinkNode.data.text?.split('\n').find((line) => line.trim())
      ?? 'Card',
    ).replace(/^#+\s*/, '').slice(0, 120)
  })()

  return (
    <CanvasEditorActionsContext.Provider value={actions}>
      <CanvasValidationContext.Provider value={validation}>
        <div className="editor-shell">
        {trail.length > 1 && (
          <nav className="editor-trail" aria-label="Canvas trail">
            <button onClick={() => void openTrail(-1)}>Canvases</button>
            {trail.map((entry, index) => (
              index === trail.length - 1
                ? <span key={entry.id}>{entry.label}</span>
                : <button key={entry.id} onClick={() => void openTrail(index)}>{entry.label}</button>
            ))}
          </nav>
        )}
        <CanvasToolbar
          title={title}
          profileLabel={profile.label}
          isSystems={isSystems}
          status={status}
          canUndo={canUndo}
          canRedo={canRedo}
          selectedEdge={Boolean(selectedEdge)}
          relationValue={relationValue}
          relationTypes={profileRelationTypes}
          availableEntityTypes={availableEntityTypes}
          issueCount={validationIssues.length}
          errorCount={validationIssues.filter((issue) => issue.severity === 'error').length}
          suggestionCount={suggestions.length}
          onBack={() => void back()}
          backLabel={trail.length > 1 ? 'Back' : 'All canvases'}
          onUndo={undo}
          onRedo={redo}
          onHelp={() => setHelpOpen(true)}
          onRename={() => setRenameOpen(true)}
          onRelationChange={changeRelation}
          onToggleValidation={() => {
            setValidationFocusRequest(null)
            setValidationPanel((current) => current === 'warnings' ? null : 'warnings')
          }}
          onToggleIntelligence={() => {
            setValidationFocusRequest(null)
            setValidationPanel((current) => current === 'intelligence' ? null : 'intelligence')
          }}
          onAddNote={addNoteAtCenter}
          onAddCard={addAtCenter}
          onAddEntity={addEntityAtCenter}
          onAddProcessCanvas={() => void addProcessWithCanvas()}
          onSave={() => void save()}
          onDownload={() => void download()}
          onScreenshot={() => { setScreenshotError(''); setScreenshotOpen(true) }}
          onOpenViews={() => setViewsOpen(true)}
          onFitView={fitCanvas}
          onAutoLayout={autoLayout}
          onDataFlowLayout={dataFlowLayout}
          onAutoFitAll={autoFitAll}
        />

        {notice && (
          <div className="editor-notice" role="status">
            <span>{notice}</span>
            <button className="icon-button" onClick={() => setNotice('')} aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        )}

        {error && <div className="alert editor-alert" role="alert">{error}</div>}

        <div className={`canvas-flow${connectNodeId ? ' connect-mode' : ''}`} ref={flowRef} onDoubleClick={handleDoubleClick}>
          <CanvasBackdrop />
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
            reconnectRadius={26}
            onNodeDragStart={() => setAlignmentGuides([])}
            onNodeDragStop={() => {
              setAlignmentGuides([])
            }}
            onMoveStart={() => setAlignmentGuides([])}
            onSelectionChange={({ edges: selectedEdgeList }) => {
              setSelectedEdgeId(selectedEdgeList[0]?.id ?? null)
            }}
            onNodeClick={(_, node) => {
              if (!connectNodeId || node.id === connectNodeId) return
              if (node.type === 'group') {
                setNotice('Groups cannot be connection endpoints.')
                return
              }
              connectNodes(connectNodeId, node.id)
            }}
            onPaneClick={() => {
              if (connectNodeId) setConnectNodeId(null)
            }}
            connectionMode={ConnectionMode.Loose}
            fitView={shouldFitInitial}
            fitViewOptions={{ padding: 0.25, maxZoom: 1.2 }}
            defaultViewport={savedViewport ?? undefined}
            onMoveEnd={(_, viewport: Viewport) => writeViewport(document.id, viewport, viewportLayout)}
            minZoom={isMobile ? 0.08 : 0.2}
            maxZoom={2.5}
            zoomOnDoubleClick={false}
            panOnScroll
            panActivationKeyCode="Space"
            zoomActivationKeyCode={['Meta', 'Control']}
            multiSelectionKeyCode="Shift"
            panOnDrag={isMobile ? true : [1, 2]}
            selectionOnDrag={!isMobile}
            deleteKeyCode={['Backspace', 'Delete']}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--ui-pattern)" />
            <Controls showInteractive={false} />
            {pendingConnection && (
              <ConnectionPreview nodes={nodes} pending={pendingConnection} />
            )}
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
          {areaMode && (
            <div
              className="screenshot-selection-layer"
              onPointerDown={onAreaPointerDown}
              onPointerMove={onAreaPointerMove}
              onPointerUp={(event) => { void onAreaPointerUp(event) }}
              onPointerCancel={cancelAreaSelection}
            >
              <div
                className="screenshot-selection-hint"
                onPointerDown={(event) => event.stopPropagation()}
              >
                <span>Drag to select an area</span>
                <button className="button" onClick={cancelAreaSelection}>Cancel</button>
              </div>
              {dragBox && (
                <div
                  className="screenshot-selection-box"
                  style={{
                    left: dragBox.x,
                    top: dragBox.y,
                    width: dragBox.width,
                    height: dragBox.height,
                  }}
                />
              )}
            </div>
          )}
          <button
            className="canvas-help-hint"
            onClick={() => setHelpOpen(true)}
            aria-label="Show shortcuts help"
          >
            ? Shortcuts
          </button>
          {!pendingConnection && !cardMenu && !edgeLabelEditor && (
            <SelectionToolbar
              selectedNodes={selectedNodes.length}
              selectedEdges={selectedEdges.length}
              canGroup={selectedNodes.some((node) => node.type !== 'group')}
              canConnect={coarsePointer && Boolean(singleSelectedNode) && singleSelectedNode?.type !== 'group'}
              connectMode={connectNodeId !== null}
              onConnect={() => setConnectNodeId((current) => current ? null : singleSelectedNode?.id ?? null)}
              canResize={Boolean(singleSelectedNode)}
              onResize={() => setSizeDialogOpen(true)}
              cardTypeValue={cardTypeValue}
              allowText={!isSystems}
              entityTypeIds={availableEntityTypes.map((entityType) => entityType.id)}
              onCardTypeChange={changeCardType}
              onGroup={groupSelected}
              onReverse={reverseSelectedEdges}
              canManageMembership={canManageMembership}
              membershipLabel={allSelectedCardsAreMembers ? 'Remove from group' : 'Add to group'}
              onToggleMembership={toggleGroupMembership}
              onDuplicate={duplicateSelection}
              onDelete={deleteSelected}
              onClear={clearSelection}
              onColor={applyColor}
            />
          )}
          {pendingConnection && (
            <ConnectionTemplateMenu
              x={pendingConnection.screen.x}
              y={pendingConnection.screen.y}
              profile={profile}
              onSelect={insertConnectedNode}
              onClose={() => setPendingConnection(null)}
            />
          )}
          {cardMenu && (
            <ConnectionTemplateMenu
              x={cardMenu.screen.x}
              y={cardMenu.screen.y}
              profile={profile}
              mode="card"
              onSelect={insertCardFromMenu}
              onClose={() => setCardMenu(null)}
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
          {isSystems && validationPanel === 'warnings' && (
            <ProfileValidationTray
              key={validationFocusRequest?.requestId ?? 'validation'}
              issues={prioritizedIssues}
              ignoredIssues={ignoredPrioritizedIssues}
              nodes={nodes}
              edges={edges}
              profile={profile}
              ontology={ontology}
              ignoredReasons={ignoredReasons}
              focusRequest={validationFocusRequest}
              onClose={() => {
                setValidationPanel(null)
                setValidationFocusRequest(null)
              }}
              onFocus={focusValidationIssue}
              onIgnore={ignoreValidationIssue}
              onRestore={restoreValidationIssue}
            />
          )}
          {isSystems && validationPanel === 'intelligence' && (
            <CanvasIntelligencePanel
              suggestions={suggestions}
              onClose={() => {
                setValidationPanel(null)
                setValidationFocusRequest(null)
              }}
              onPreviewSuggestion={focusSuggestion}
              onApplySuggestion={applySuggestion}
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

        {singleSelectedNode && sizeDialogOpen && (
          <NodeSizeDialog
            key={singleSelectedNode.id}
            label={singleSelectedNode.type === 'group' ? 'group' : 'card'}
            width={nodeDimensions(singleSelectedNode).width}
            height={nodeDimensions(singleSelectedNode).height}
            onApply={(width, height) => {
              resizeNode(singleSelectedNode.id, width, height)
              setSizeDialogOpen(false)
            }}
            onClose={() => setSizeDialogOpen(false)}
          />
        )}

        <ScreenshotDialog
          open={screenshotOpen}
          busy={screenshotBusy}
          scale={screenshotScale}
          error={screenshotError}
          onScaleChange={setScreenshotScale}
          onFull={() => { void captureFull() }}
          onSelect={beginAreaSelection}
          onClose={() => setScreenshotOpen(false)}
        />

        <KeyboardShortcutsDialog open={helpOpen} onClose={() => setHelpOpen(false)} />

        {isSystems && (
          <DerivedViewsDialog
            open={viewsOpen}
            title={title}
            nodes={nodes}
            edges={edges}
            ontology={ontology}
            onClose={() => setViewsOpen(false)}
          />
        )}

        {canvasLinkNode && (
          <CanvasLinksDialog
            nodeName={canvasLinkNodeName}
            links={getCanvasLinks(canvasLinkNode.data.raw)}
            currentCanvasId={document.id}
            trailIds={trail.map((entry) => entry.id)}
            canvases={canvasOptions}
            loading={canvasOptionsLoading}
            error={canvasOptionsError}
            onClose={() => setCanvasLinkNodeId(null)}
            onOpen={openLinkedCanvas}
            onLinkExisting={linkExistingCanvas}
            onUnlink={unlinkCanvas}
            onLabel={relabelCanvas}
            onCreateNew={createLinkedCanvas}
          />
        )}

        {renameOpen && (
          <CanvasNameDialog
            heading="Rename canvas"
            initialValue={title}
            confirmLabel="Save name"
            busy={renameBusy}
            onConfirm={(nextTitle) => void renameCanvas(nextTitle)}
            onCancel={() => setRenameOpen(false)}
          />
        )}
        </div>
      </CanvasValidationContext.Provider>
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
