import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  ViewportPortal,
  type Viewport,
  useReactFlow,
} from '@xyflow/react'
import { X } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import {
  emptyEntityFields,
  getCanvasLinks,
  findEntityType,
  renderEntityMarkdown,
  type CanvasDocument,
  type CanvasNode,
  type CanvasNodeSide,
  type CanvasProfileIssue,
} from '@canvas/contract'

import type { CanvasClient } from '../../api/client'
import {
  nodeDimensions,
  toFlowCanvas,
  toFlowEdge,
  toFlowNode,
  type CanvasFlowEdge,
  type CanvasFlowNode,
} from '../model/adapter'
import { useOntology } from '../../ontology/OntologyContext'
import { useCoarsePointer, useIsMobile } from '../../useMediaQuery'
import { CanvasEditorActionsContext, type CanvasEditorActions } from './CanvasEditorContext'
import { CanvasBackdrop } from '../backdrop/CanvasBackdrop'
import { CanvasValidationContext } from './CanvasValidationContext'
import { CanvasToolbar } from './CanvasToolbar'
import { useCanvasDocument } from './document/useCanvasDocument'
import { useCanvasCommands } from './commands'
import { ConnectionTemplateMenu } from './ConnectionTemplateMenu'
import { ReviewPanel, type ReviewTab } from './ReviewPanel'
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
import { ConnectionPreview } from './graph/ConnectionPreview'
import { makeEntityNode } from './graph/nodes'
import { useCanvasGraph } from './graph/useCanvasGraph'
import { useCanvasCapture } from './capture/useCanvasCapture'
import { useCanvasLinks } from './links/useCanvasLinks'
import { useCanvasProfile } from './useCanvasProfile'
import { useProfileValidation } from './useProfileValidation'
import { prioritizeValidationIssues } from './prioritizeIssues'
import { buildSuggestions, type CanvasSuggestion } from '../suggestions/suggestionEngine'
import {
  createSuppression,
  readValidationSuppressions,
  type IgnoreReason,
  type ValidationSuppression,
} from './validationSuppressions'
import { validationIssueKey } from './validationIdentity'
import { readViewport, writeViewport } from './viewport'
import { CanvasEdge as CanvasEdgeComponent } from './edges/CanvasEdge'
import { edgeFromConnection } from '../model/edgeRelations'
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
    observe: observeHistory,
    redo: redoHistory,
    reset: resetHistory,
    undo: undoHistory,
  } = history
  const [nodes, setNodes] = useState<CanvasFlowNode[]>(initial.nodes)
  const [edges, setEdges] = useState<CanvasFlowEdge[]>(initial.edges)
  const [helpOpen, setHelpOpen] = useState(false)
  const [viewsOpen, setViewsOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewTab, setReviewTab] = useState<ReviewTab>('issues')
  const [validationFocusRequest, setValidationFocusRequest] = useState<{ key: string; requestId: number } | null>(null)
  const validationRequestId = useRef(0)
  const [suppressions, setSuppressions] = useState<ValidationSuppression[]>(() => (
    readValidationSuppressions(document.canvas)
  ))
  const {
    title,
    renameOpen,
    setRenameOpen,
    renameBusy,
    baseCanvas,
    dirty,
    status,
    error,
    setError,
    notice,
    setNotice,
    conflicts,
    markDirty,
    save,
    renameCanvas,
    download,
    back,
    reloadLatest,
    keepMine,
  } = useCanvasDocument({
    client,
    document,
    ontology,
    nodes,
    edges,
    suppressions,
    setNodes,
    setEdges,
    setSuppressions,
    resetHistory,
    onBack,
    onReloaded: () => {
      window.setTimeout(() => {
        void fitView({ padding: 0.25, maxZoom: 1.2 })
      }, 0)
    },
  })
  const flowRef = useRef<HTMLDivElement>(null)
  const { fitView } = useReactFlow()

  const graph = useCanvasGraph({
    nodes,
    edges,
    setNodes,
    setEdges,
    markDirty,
    setNotice,
    ontology,
    isSystems,
    flowRef,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    undoHistory,
    redoHistory,
  })

  const {
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
  } = graph

  const prepareAreaSelection = useCallback(() => {
    setHelpOpen(false)
    closeTransientUi()
  }, [closeTransientUi])

  const capture = useCanvasCapture({
    nodes,
    title,
    flowRef,
    clientToFlow,
    clearSelection,
    prepareAreaSelection,
    setNotice,
    setError,
  })

  const {
    screenshotOpen,
    screenshotBusy,
    screenshotScale,
    setScreenshotScale,
    screenshotError,
    areaMode,
    dragBox,
    openScreenshot,
    closeScreenshot,
    captureFull,
    beginAreaSelection,
    cancelAreaSelection,
    onAreaPointerDown,
    onAreaPointerMove,
    onAreaPointerUp,
  } = capture

  const links = useCanvasLinks({
    client,
    documentId: document.id,
    profileId: profile.id,
    trail,
    dirty,
    save,
    onOpenLinkedCanvas,
    onOpenTrail,
    nodes,
    setNodes,
    markDirty,
    setNotice,
    setError,
    ontology,
    placementPosition,
    revealPlacement,
  })

  const {
    canvasLinkNode,
    canvasLinkNodeName,
    canvasOptions,
    canvasOptionsLoading,
    canvasOptionsError,
    openCanvasLinks,
    closeCanvasLinks,
    linkExistingCanvas,
    unlinkCanvas,
    relabelCanvas,
    createLinkedCanvas,
    openLinkedCanvas,
    openTrail,
    addProcessWithCanvas,
  } = links

  useEffect(() => observeHistory({ nodes, edges }), [edges, nodes, observeHistory])

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
        if (window.document.querySelector('.command-menu-popup, .command-sheet, .appearance-popup, .avatar-popup')) return
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
    setCardMenu,
    setEdgeLabelEditor,
    setPendingConnection,
    undo,
    zoomSelection,
  ])

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
  }, [markDirty, setNotice, setSuppressions])

  const restoreValidationIssue = useCallback((issue: CanvasProfileIssue) => {
    const fingerprint = validationIssueKey(issue)
    setSuppressions((current) => current.filter((suppression) => suppression.fingerprint !== fingerprint))
    setNotice('Warning restored.')
    markDirty()
  }, [markDirty, setNotice, setSuppressions])

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
    setNotice(`Applied suggested fix: ${suggestion.title.toLowerCase()}.`)
    setReviewOpen(false)
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
    setReviewTab('issues')
    setReviewOpen(true)
  }

  const validation = {
    nodeIssues,
    edgeIssues,
    openIssue: openValidationIssue,
  }

  const commands = useCanvasCommands({
    backLabel: trail.length > 1 ? 'Back' : 'All canvases',
    isSystems,
    issueCount: validationIssues.length,
    errorCount: validationIssues.filter((issue) => issue.severity === 'error').length,
    canUndo,
    canRedo,
    availableEntityTypes,
    onBack: () => void back(),
    onRename: () => setRenameOpen(true),
    onAddNote: addNoteAtCenter,
    onAddCard: addAtCenter,
    onAddEntity: addEntityAtCenter,
    onAddProcessCanvas: () => void addProcessWithCanvas(),
    onViews: () => setViewsOpen(true),
    onReview: () => {
      setValidationFocusRequest(null)
      setReviewOpen(true)
    },
    onUndo: undo,
    onRedo: redo,
    onSave: () => { void save() },
    onTidy: autoLayout,
    onFitCards: autoFitAll,
    onFitView: fitCanvas,
    onDownload: () => void download(),
    onScreenshot: openScreenshot,
    onHelp: () => setHelpOpen(true),
  })

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
          commands={commands}
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
              relationValue={selectedRelationValue}
              relationTypes={profileRelationTypes.map((relation) => ({ id: relation.id, label: relation.label }))}
              allowUnspecified={isSystems}
              onRelationChange={changeRelation}
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
          {isSystems && reviewOpen && (
            <ReviewPanel
              tab={reviewTab}
              onTabChange={setReviewTab}
              issues={prioritizedIssues}
              ignoredIssues={ignoredPrioritizedIssues}
              suggestions={suggestions}
              nodes={nodes}
              edges={edges}
              profile={profile}
              ontology={ontology}
              ignoredReasons={ignoredReasons}
              focusRequest={validationFocusRequest}
              onClose={() => {
                setReviewOpen(false)
                setValidationFocusRequest(null)
              }}
              onFocus={focusValidationIssue}
              onIgnore={ignoreValidationIssue}
              onRestore={restoreValidationIssue}
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
          onClose={closeScreenshot}
        />

        <KeyboardShortcutsDialog open={helpOpen} onClose={() => setHelpOpen(false)} commands={commands} />

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
            onClose={closeCanvasLinks}
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
