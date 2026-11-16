import { ReactFlowProvider, useReactFlow } from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { toFlowCanvas, type CanvasFlowEdge, type CanvasFlowNode } from '../model/adapter'
import { useOntology } from '../../ontology/OntologyContext'
import { useCoarsePointer, useIsMobile } from '../../useMediaQuery'
import { CanvasEditorActionsContext, type CanvasEditorActions, type CanvasEditorProps } from './CanvasEditorContext'
import { CanvasValidationContext } from './CanvasValidationContext'
import { CanvasWorkspace } from './CanvasWorkspace'
import { EditorChrome } from './EditorChrome'
import { EditorDialogs } from './EditorDialogs'
import { useCanvasCommands } from './commands'
import { useCanvasDocument } from './document/useCanvasDocument'
import { useCanvasGraph } from './graph/useCanvasGraph'
import { useCanvasCapture } from './capture/useCanvasCapture'
import { useCanvasLinks } from './links/useCanvasLinks'
import { useCanvasProfile } from './useCanvasProfile'
import { useCanvasValidation } from './validation/useCanvasValidation'
import { useApiManagedRelations } from '../apiDesign/useApiManagedRelations'
import { useCanvasHistory } from './useCanvasHistory'
import { useEditorShortcuts } from './useEditorShortcuts'
import { readValidationSuppressions, type ValidationSuppression } from './validationSuppressions'
import { readViewport } from './viewport'

function CanvasEditorInner({ client, document, onBack, trail, onOpenTrail, onOpenLinkedCanvas }: CanvasEditorProps) {
  const ontology = useOntology()
  const isMobile = useIsMobile()
  const coarsePointer = useCoarsePointer()
  const { profile, isSystems, isApi, isStructured, availableEntityTypes, profileRelationTypes } = useCanvasProfile(ontology, document)
  const initial = useMemo(() => toFlowCanvas(document.canvas, ontology), [document, ontology])
  const viewportLayout = isMobile ? 'mobile' as const : 'desktop' as const
  const savedViewport = useMemo(() => readViewport(document.id, viewportLayout), [document.id, viewportLayout])
  const shouldFitInitial = useMemo(() => !savedViewport && (document.canvas.nodes?.length ?? 0) > 0,
    [document.canvas.nodes?.length, savedViewport])
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
  const [suppressions, setSuppressions] = useState<ValidationSuppression[]>(() => (
    readValidationSuppressions(document.canvas)
  ))
  const flowRef = useRef<HTMLDivElement>(null)
  const { fitView } = useReactFlow()

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
    onReloaded: () => window.setTimeout(() => void fitView({ padding: 0.25, maxZoom: 1.2 }), 0),
  })

  const graph = useCanvasGraph({
    nodes,
    edges,
    setNodes,
    setEdges,
    markDirty,
    setNotice,
    ontology,
    isSystems: isStructured,
    flowRef,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    undoHistory,
    redoHistory,
  })

  const prepareAreaSelection = useCallback(() => {
    setHelpOpen(false)
    graph.closeTransientUi()
  }, [graph])

  const capture = useCanvasCapture({
    nodes,
    title,
    flowRef,
    clientToFlow: graph.clientToFlow,
    clearSelection: graph.clearSelection,
    prepareAreaSelection,
    setNotice,
    setError,
  })

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
    placementPosition: graph.placementPosition,
    revealPlacement: graph.revealPlacement,
  })

  const validation = useCanvasValidation({
    nodes,
    edges,
    baseCanvas,
    profile,
    ontology,
    isSystems: isStructured,
    suppressions,
    setSuppressions,
    setNodes,
    setEdges,
    selectEdge: graph.selectEdge,
    markDirty,
    setNotice,
  })

  useEffect(() => observeHistory({ nodes, edges }), [edges, nodes, observeHistory])

  const actions = useMemo<CanvasEditorActions>(
    () => ({
      updateText: graph.updateText,
      updateLabel: graph.updateLabel,
      updateEntityField: graph.updateEntityField,
      resizeNode: graph.resizeNode,
      autoFitNode: graph.autoFitNode,
      editEdgeLabel: graph.openEdgeLabelEditor,
      selectEdge: graph.selectEdge,
      openCanvasLinks: links.openCanvasLinks,
      createOrOpenApiCanvas: links.createOrOpenApiCanvas,
    }),
    [
      graph.autoFitNode,
      graph.openEdgeLabelEditor,
      graph.resizeNode,
      graph.selectEdge,
      graph.updateEntityField,
      graph.updateLabel,
      graph.updateText,
      links.createOrOpenApiCanvas,
      links.openCanvasLinks,
    ],
  )

  useApiManagedRelations({
    nodes,
    setEdges,
    enabled: isApi,
  })

  const commands = useCanvasCommands({
    backLabel: trail.length > 1 ? 'Back' : 'All canvases',
    isSystems: isStructured,
    profileId: profile.id,
    issueCount: validation.validationIssues.length,
    errorCount: validation.validationIssues.filter((issue) => issue.severity === 'error').length,
    canUndo: graph.canUndo,
    canRedo: graph.canRedo,
    availableEntityTypes,
    onBack: () => void back(),
    onRename: () => setRenameOpen(true),
    onAddNote: graph.addNoteAtCenter,
    onAddCard: graph.addAtCenter,
    onAddEntity: graph.addEntityAtCenter,
    onAddProcessCanvas: () => void links.addProcessWithCanvas(),
    onViews: () => setViewsOpen(true),
    onReview: validation.openReview,
    onUndo: graph.undo,
    onRedo: graph.redo,
    onSave: () => { void save() },
    onTidy: graph.autoLayout,
    onFitCards: graph.autoFitAll,
    onFitView: graph.fitCanvas,
    onDownload: () => void download(),
    onScreenshot: capture.openScreenshot,
    onHelp: () => setHelpOpen(true),
    onDuplicate: graph.duplicateSelection,
    onSelectAll: graph.selectAll,
    onGroup: graph.groupSelected,
    onNudge: graph.nudgeSelection,
    onZoomSelection: graph.zoomSelection,
    onDismiss: () => {
      if (helpOpen) setHelpOpen(false)
      else if (graph.pendingConnection) graph.setPendingConnection(null)
      else if (graph.cardMenu) graph.setCardMenu(null)
      else if (graph.edgeLabelEditor) graph.setEdgeLabelEditor(null)
      else graph.clearSelection()
    },
  })

  useEditorShortcuts(commands)

  return (
    <CanvasEditorActionsContext.Provider value={actions}>
      <CanvasValidationContext.Provider value={validation.validation}>
        <div className="editor-shell">
          <EditorChrome
            trail={trail}
            onOpenTrail={(index) => void links.openTrail(index)}
            title={title}
            profileLabel={profile.label}
            isSystems={isSystems}
            status={status}
            commands={commands}
            notice={notice}
            onDismissNotice={() => setNotice('')}
            error={error}
          />
          <CanvasWorkspace
            documentId={document.id}
            nodes={nodes}
            edges={edges}
            isMobile={isMobile}
            coarsePointer={coarsePointer}
            isSystems={isStructured}
            profile={profile}
            ontology={ontology}
            availableEntityTypes={availableEntityTypes}
            profileRelationTypes={profileRelationTypes}
            shouldFitInitial={shouldFitInitial}
            savedViewport={savedViewport}
            viewportLayout={viewportLayout}
            flowRef={flowRef}
            graph={graph}
            capture={capture}
            validation={validation}
            setNotice={setNotice}
            onOpenHelp={() => setHelpOpen(true)}
          />
          <EditorDialogs
            documentId={document.id}
            title={title}
            nodes={nodes}
            edges={edges}
            ontology={ontology}
            isSystems={isStructured}
            isApi={isApi}
            trail={trail}
            commands={commands}
            conflicts={conflicts}
            onReloadLatest={() => void reloadLatest()}
            onKeepMine={() => void keepMine()}
            graph={graph}
            capture={capture}
            links={links}
            helpOpen={helpOpen}
            setHelpOpen={setHelpOpen}
            viewsOpen={viewsOpen}
            setViewsOpen={setViewsOpen}
            renameOpen={renameOpen}
            setRenameOpen={setRenameOpen}
            renameBusy={renameBusy}
            renameCanvas={renameCanvas}
          />
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
