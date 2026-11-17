import { ReactFlowProvider, useReactFlow } from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  addApiResource,
  applyStandardErrors,
  createNodeId,
  deriveManagedRelations,
  exportOpenApiDocument,
  findEntityType,
  getEntityMeta,
  OpenApiExportError,
  renameApiResource,
  renderEntityMarkdown,
  stringifyOpenApiYaml,
  type CanvasNode,
  type EntityFields,
  type Ontology,
  type AddApiResourceInput,
  type JsonObject,
} from '@canvas/contract'
import {
  fromFlowCanvas,
  nodeDimensions,
  toFlowCanvas,
  toFlowEdge,
  toFlowNode,
  type CanvasFlowEdge,
  type CanvasFlowNode,
} from '../model/adapter'
import { useOntology } from '../../ontology/OntologyContext'
import { useCoarsePointer, useIsMobile } from '../../useMediaQuery'
import {
  CanvasEditorActionsContext,
  NodeEditRequestContext,
  type CanvasEditorActions,
  type CanvasSchemaResult,
  type CanvasEditorProps,
  type NodeEditRequest,
} from './CanvasEditorContext'
import { CanvasValidationContext } from './CanvasValidationContext'
import { CanvasWorkspace } from './CanvasWorkspace'
import { EditorChrome } from './EditorChrome'
import { EditorDialogs } from './EditorDialogs'
import { useCanvasCommands } from './commands'
import { useCanvasDocument } from './document/useCanvasDocument'
import { makeEntityNode } from './graph/nodes'
import { useCanvasGraph } from './graph/useCanvasGraph'
import { useCanvasCapture } from './capture/useCanvasCapture'
import { useCanvasLinks } from './links/useCanvasLinks'
import { useCanvasProfile } from './useCanvasProfile'
import { useCanvasValidation } from './validation/useCanvasValidation'
import { useApiManagedRelations } from '../apiDesign/useApiManagedRelations'
import { insertNodes } from '../model/insertNodes'
import { ApiDesignProvider } from '../apiDesign/ApiDesignProvider'
import { SchemaCardsProvider } from '../schema/SchemaCardsContext'
import {
  artifactSchemaMode,
  extractArtifactSchema,
  inlineArtifactSchema,
} from '../schema/embeddedSchema'
import { AddResourceDialog } from '../apiDesign/AddResourceDialog'
import { OpenApiCompareDialog } from '../apiDesign/OpenApiCompareDialog'
import { useCanvasHistory } from './useCanvasHistory'
import { useEditorShortcuts } from './useEditorShortcuts'
import { readValidationSuppressions, type ValidationSuppression } from './validationSuppressions'
import { readViewport } from './viewport'

function withEntityFields(
  node: CanvasFlowNode,
  fields: EntityFields,
  ontology: Ontology,
): CanvasFlowNode {
  const meta = node.data.entity
  const entityType = meta ? findEntityType(ontology, meta.entityType) : undefined
  if (!meta || !entityType) return node
  const entity = { ...meta, fields }
  const text = renderEntityMarkdown(entityType, fields)
  return {
    ...node,
    data: {
      ...node.data,
      entity,
      text,
      raw: { ...node.data.raw, app: entity, text },
    },
  }
}

function titleSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'api'
}

function downloadText(filename: string, text: string, mediaType: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mediaType }))
  const anchor = window.document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function prefixFromPaths(nodes: CanvasFlowNode[]): string {
  const segments = nodes.flatMap((node) => {
    const path = String(node.data.entity?.fields.path ?? '')
    const segment = path.split('/').filter(Boolean)[0]
    return segment ? [segment] : []
  })
  if (segments.length === 0) return ''
  const first = segments[0]!
  return segments.every((segment) => segment === first) && /^v\d+$/i.test(first)
    ? `/${first}`
    : ''
}

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
  const [addResourceOpen, setAddResourceOpen] = useState(false)
  const [compareHead, setCompareHead] = useState<JsonObject | null>(null)
  const [suppressions, setSuppressions] = useState<ValidationSuppression[]>(() => (
    readValidationSuppressions(document.canvas)
  ))
  const [nodeEditRequest, setNodeEditRequest] = useState<NodeEditRequest | null>(null)
  const editRequestToken = useRef(0)
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
    isApi,
    suppressions,
    setSuppressions,
    setNodes,
    setEdges,
    selectEdge: graph.selectEdge,
    markDirty,
    setNotice,
  })

  useEffect(() => observeHistory({ nodes, edges }), [edges, nodes, observeHistory])

  const updateEntityField = useCallback((id: string, fieldKey: string, value: string) => {
    const target = nodes.find((node) => node.id === id)
    if (target?.data.entity?.entityType === 'resource' && fieldKey === 'name') {
      if (!value.trim()) return
      const canvas = fromFlowCanvas(nodes, edges, baseCanvas)
      const renamed = renameApiResource(canvas, id, value)
      const rawById = new Map(renamed.nodes.map((node) => [node.id, node]))
      setNodes((current) => current.map((node) => {
        const raw = rawById.get(node.id)
        if (!raw) return node
        const entity = getEntityMeta(raw)
        const entityType = entity ? findEntityType(ontology, entity.entityType) : undefined
        if (!entity || !entityType) return { ...node, data: { ...node.data, raw } }
        const text = renderEntityMarkdown(entityType, entity.fields)
        return {
          ...node,
          data: { ...node.data, entity, text, raw: { ...raw, text } },
        }
      }))
      const managed = deriveManagedRelations({ nodes: renamed.nodes, edges: [] })
      setEdges((current) => [
        ...current.filter((edge) => (
          edge.data?.raw?.app?.managed !== true
          && edge.data?.relationType !== 'accepts'
          && edge.data?.relationType !== 'returns'
        )),
        ...managed.map((edge) => toFlowEdge(edge)),
      ])
      markDirty()
      return
    }
    graph.updateEntityField(id, fieldKey, value)
  }, [baseCanvas, edges, graph, markDirty, nodes, ontology, setEdges, setNodes])

  const openNodeEditor = useCallback((id: string) => {
    editRequestToken.current += 1
    setNodeEditRequest({ id, token: editRequestToken.current })
    setNodes((current) => current.map((node) => ({ ...node, selected: node.id === id })))
    window.setTimeout(() => {
      void fitView({ nodes: [{ id }], padding: 0.35, maxZoom: 1.2 })
    }, 0)
  }, [fitView, setNodes])

  const extractSchemaCard = useCallback((artifactId: string): CanvasSchemaResult => {
    const artifact = nodes.find((node) => node.id === artifactId)
    const meta = artifact?.data.entity
    const fields = meta?.fields
    if (!artifact || !meta || meta.entityType !== 'artifact' || !fields) {
      return { ok: false, error: 'Artifact not found.' }
    }
    if (artifactSchemaMode(fields) !== 'inline') {
      return { ok: false, error: 'Define the schema here before extracting it.' }
    }
    const schemaType = findEntityType(ontology, 'schema')
    if (!schemaType) return { ok: false, error: 'The schema card type is unavailable.' }
    const schemaId = createNodeId()
    const extracted = extractArtifactSchema(fields, schemaId)
    const placement = graph.placementPosition(schemaType.defaultSize.width, schemaType.defaultSize.height)
    const base = makeEntityNode('schema', placement, ontology)
    if (!base) return { ok: false, error: 'Could not create the Schema card.' }
    const schemaFields = { ...(base.app?.fields ?? {}), ...extracted.schema }
    const schemaText = renderEntityMarkdown(schemaType, schemaFields)
    const created = {
      ...base,
      id: schemaId,
      app: { ...(base.app ?? {}), entityType: 'schema', fields: schemaFields },
      text: schemaText,
    } as CanvasNode
    setNodes((current) => insertNodes(
      current.map((node) => (
        node.id === artifactId ? withEntityFields(node, extracted.artifact, ontology) : node
      )),
      [{ ...toFlowNode(created), selected: true }],
    ))
    markDirty()
    graph.revealPlacement(placement.visible)
    setNotice(`Extracted schema to "${String(extracted.schema.name ?? 'Schema')}".`)
    return { ok: true, schemaId }
  }, [graph, markDirty, nodes, ontology, setNodes, setNotice])

  const inlineSchemaCard = useCallback((artifactId: string): CanvasSchemaResult => {
    const artifact = nodes.find((node) => node.id === artifactId)
    const meta = artifact?.data.entity
    const fields = meta?.fields
    if (!artifact || !meta || meta.entityType !== 'artifact' || !fields) {
      return { ok: false, error: 'Artifact not found.' }
    }
    if (artifactSchemaMode(fields) !== 'shared') {
      return { ok: false, error: 'Choose a shared schema before inlining it.' }
    }
    const schemaRef = String(fields.schemaRef ?? '')
    const card = nodes.find((node) => (
      node.id === schemaRef && node.data.entity?.entityType === 'schema'
    ))
    if (!card) return { ok: false, error: 'The shared Schema card is missing.' }
    const source = String(card.data.entity?.fields.source ?? '')
    setNodes((current) => current.map((node) => (
      node.id === artifactId
        ? withEntityFields(node, inlineArtifactSchema(fields, source), ontology)
        : node
    )))
    markDirty()
    setNotice(`Inlined schema from "${String(card.data.entity?.fields.name ?? 'Schema')}".`)
    return { ok: true }
  }, [markDirty, nodes, ontology, setNodes, setNotice])

  const actions = useMemo<CanvasEditorActions>(
    () => ({
      updateText: graph.updateText,
      updateLabel: graph.updateLabel,
      updateEntityField,
      resizeNode: graph.resizeNode,
      autoFitNode: graph.autoFitNode,
      editEdgeLabel: graph.openEdgeLabelEditor,
      selectEdge: graph.selectEdge,
      openCanvasLinks: links.openCanvasLinks,
      createOrOpenApiCanvas: links.createOrOpenApiCanvas,
      openNodeEditor,
      extractSchemaCard,
      inlineSchemaCard,
    }),
    [
      extractSchemaCard,
      graph.autoFitNode,
      graph.openEdgeLabelEditor,
      graph.resizeNode,
      graph.selectEdge,
      graph.updateLabel,
      graph.updateText,
      inlineSchemaCard,
      links.createOrOpenApiCanvas,
      links.openCanvasLinks,
      openNodeEditor,
      updateEntityField,
    ],
  )

  useApiManagedRelations({
    nodes,
    setEdges,
    enabled: isApi,
  })

  const selectedEndpointCount = graph.selectedNodes.filter((node) => (
    node.data.entity?.entityType === 'endpoint'
  )).length

  const exportDocument = useCallback((format: 'json' | 'yaml') => {
    const canvas = fromFlowCanvas(nodes, edges, baseCanvas)
    const exported = exportOpenApiDocument(canvas)
    return {
      text: format === 'yaml' ? stringifyOpenApiYaml(exported) : JSON.stringify(exported, null, 2),
      filename: `${titleSlug(title)}.openapi.${format}`,
    }
  }, [baseCanvas, edges, nodes, title])

  const reportExportFailure = useCallback((cause: unknown) => {
    if (cause instanceof OpenApiExportError) {
      setError(`OpenAPI export stopped. ${cause.issues.map((issue) => `${issue.label}: invalid ${issue.field} JSON`).join('; ')}`)
    } else {
      setError(cause instanceof Error ? cause.message : 'OpenAPI export failed.')
    }
  }, [setError])

  const onExportOpenApi = useCallback((format: 'json' | 'yaml') => {
    try {
      const output = exportDocument(format)
      downloadText(output.filename, output.text, format === 'yaml' ? 'application/yaml' : 'application/json')
      setNotice(`Exported ${output.filename}.`)
    } catch (cause) {
      reportExportFailure(cause)
    }
  }, [exportDocument, reportExportFailure, setNotice])

  const openCompare = useCallback(() => {
    try {
      setCompareHead(exportOpenApiDocument(fromFlowCanvas(nodes, edges, baseCanvas)))
    } catch (cause) {
      reportExportFailure(cause)
    }
  }, [baseCanvas, edges, nodes, reportExportFailure])

  const onCopyOpenApi = useCallback((format: 'json' | 'yaml') => {
    try {
      const output = exportDocument(format)
      void navigator.clipboard.writeText(output.text)
        .then(() => setNotice(`Copied OpenAPI ${format.toUpperCase()}.`))
        .catch(() => setError('Clipboard access was denied.'))
    } catch (cause) {
      reportExportFailure(cause)
    }
  }, [exportDocument, reportExportFailure, setError, setNotice])

  const addResource = useCallback((input: AddApiResourceInput): string[] => {
    const canvas = fromFlowCanvas(nodes, edges, baseCanvas)
    const sizes = Object.fromEntries(nodes.map((node) => [node.id, nodeDimensions(node)]))
    const result = addApiResource(canvas, input, sizes)
    if (result.errors.length > 0) return result.errors
    const additions = result.nodes.map((node) => ({
      ...toFlowNode(node),
      selected: node.app?.entityType === 'resource',
    }))
    const rawNodes = [...(canvas.nodes ?? []), ...result.nodes]
    const managed = deriveManagedRelations({ nodes: rawNodes, edges: [] })
    setNodes((current) => [
      ...current.map((node) => ({ ...node, selected: false })),
      ...additions,
    ])
    setEdges((current) => [
      ...current.filter((edge) => (
        edge.data?.raw?.app?.managed !== true
        && edge.data?.relationType !== 'accepts'
        && edge.data?.relationType !== 'returns'
      )),
      ...managed.map((edge) => toFlowEdge(edge)),
    ])
    markDirty()
    setNotice(`Added ${result.nodes.filter((node) => node.app?.entityType === 'endpoint').length} endpoints and ${result.nodes.filter((node) => node.app?.entityType === 'schema').length} schemas.`)
    window.setTimeout(() => {
      void fitView({
        nodes: additions.map((node) => ({ id: node.id })),
        padding: 0.2,
        maxZoom: 1.2,
        duration: 300,
      })
    }, 0)
    return []
  }, [baseCanvas, edges, fitView, markDirty, nodes, setEdges, setNodes, setNotice])

  const standardErrors = useCallback(() => {
    const canvas = fromFlowCanvas(nodes, edges, baseCanvas)
    const endpointIds = graph.selectedNodes
      .filter((node) => node.data.entity?.entityType === 'endpoint')
      .map((node) => node.id)
    const result = applyStandardErrors(canvas, endpointIds)
    if (result.errors.length > 0) {
      setError(result.errors.join(' '))
      return
    }
    const byId = new Map(result.nodes.map((node) => [node.id, node]))
    setNodes((current) => {
      const currentIds = new Set(current.map((node) => node.id))
      return [
        ...current.map((node) => {
          const raw = byId.get(node.id)
          if (!raw) return node
          return { ...node, data: toFlowNode(raw).data }
        }),
        ...result.nodes.filter((node) => !currentIds.has(node.id)).map(toFlowNode),
      ]
    })
    const managed = deriveManagedRelations({ nodes: result.nodes, edges: [] })
    setEdges((current) => [
      ...current.filter((edge) => (
        edge.data?.raw?.app?.managed !== true
        && edge.data?.relationType !== 'accepts'
        && edge.data?.relationType !== 'returns'
      )),
      ...managed.map((edge) => toFlowEdge(edge)),
    ])
    markDirty()
    setNotice(result.added > 0 ? `Added ${result.added} standard error responses.` : 'Standard error responses were already present.')
  }, [baseCanvas, edges, graph.selectedNodes, markDirty, nodes, setEdges, setNodes, setError, setNotice])

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
    onTidyApi: graph.autoLayoutApi,
    onFitCards: graph.autoFitAll,
    onFitView: graph.fitCanvas,
    onDownload: () => void download(),
    onScreenshot: capture.openScreenshot,
    onAddResource: () => setAddResourceOpen(true),
    onStandardErrors: standardErrors,
    selectedEndpointCount,
    onExportOpenApi,
    onCopyOpenApi,
    onCompare: openCompare,
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
        <SchemaCardsProvider nodes={nodes.map((node) => node.data.raw)}>
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
          <ApiDesignProvider nodes={nodes} enabled={isApi}>
            <NodeEditRequestContext.Provider value={nodeEditRequest}>
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
            </NodeEditRequestContext.Provider>
          </ApiDesignProvider>
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
          {addResourceOpen && (
            <AddResourceDialog
              initialPrefix={prefixFromPaths(nodes)}
              onSubmit={addResource}
              onClose={() => setAddResourceOpen(false)}
            />
          )}
          {compareHead && (
            <OpenApiCompareDialog
              client={client}
              currentCanvasId={document.id}
              head={compareHead}
              onClose={() => setCompareHead(null)}
            />
          )}
        </div>
        </SchemaCardsProvider>
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
