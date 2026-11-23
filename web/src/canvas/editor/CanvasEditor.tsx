import { ReactFlowProvider, useReactFlow } from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  addApiEndpoint,
  addApiResource,
  addDatabaseTable,
  addReferenceToCanvas,
  applyStandardErrors,
  buildApiReferenceDocument,
  createNodeId,
  deriveManagedRelations,
  emptyEntityFields,
  exportDatabaseDdl,
  exportOpenApiDocument,
  findEntityType,
  getEntityMeta,
  OpenApiExportError,
  removeReferenceFromCanvas,
  renameApiResource,
  renderEntityMarkdown,
  stringifyOpenApiYaml,
  type AddApiEndpointInput,
  type AddApiResourceInput,
  type AddDatabaseTableInput,
  type CanvasEdge,
  type CanvasNode,
  type DatabaseReferenceConnection,
  type EntityFields,
  type JsonCanvas,
  type Ontology,
  type JsonObject,
  type LevelNumber,
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
import { applyPlacementToNodes } from './graph/planPlacement'
import { useCanvasGraph } from './graph/useCanvasGraph'
import { useCanvasCapture } from './capture/useCanvasCapture'
import { useCanvasLinks } from './links/useCanvasLinks'
import { useCanvasProfile } from './useCanvasProfile'
import { useCanvasValidation } from './validation/useCanvasValidation'
import { useApiManagedRelations } from '../apiDesign/useApiManagedRelations'
import { useDatabaseManagedRelations } from '../database/useDatabaseManagedRelations'
import { AddTableDialog } from '../database/AddTableDialog'
import { DatabaseDesignProvider } from '../database/DatabaseDesignProvider'
import { DatabaseImportDialog } from '../database/DatabaseImportDialog'
import { DatabaseSettingsDialog } from '../database/DatabaseSettingsDialog'
import type { DatabaseImportResult } from '@canvas/contract/database-import'
import { insertNodes } from '../model/insertNodes'
import {
  computeDisplay,
  displayCardTypeId,
  displayCardTypes,
  displayPresetLabel,
  readDisplayState,
  resetDisplayState,
  selectDisplayPreset,
  toggleDisplayCardType,
  toggleDisplayClass,
  writeDisplayState,
  type CanvasDisplayState,
} from '../display/display'
import { ApiDesignProvider } from '../apiDesign/ApiDesignProvider'
import { SchemaCardsProvider } from '../schema/SchemaCardsContext'
import {
  artifactSchemaMode,
  extractArtifactSchema,
  inlineArtifactSchema,
} from '../schema/embeddedSchema'
import { AddEndpointDialog } from '../apiDesign/AddEndpointDialog'
import { AddResourceDialog } from '../apiDesign/AddResourceDialog'
import { OpenApiCompareDialog } from '../apiDesign/OpenApiCompareDialog'
import { PublishBlockedDialog } from './PublishBlockedDialog'
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
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'canvas'
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
  const {
    profile,
    isSystems,
    isApi,
    isDatabase,
    isStructured,
    availableEntityTypes,
    profileRelationTypes,
  } = useCanvasProfile(ontology, document)
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
  const [viewsLevel, setViewsLevel] = useState<LevelNumber | undefined>()
  const [blockedExport, setBlockedExport] = useState<{ label: string; run: () => void } | null>(null)
  const [addResourceOpen, setAddResourceOpen] = useState(false)
  const [addEndpointOpen, setAddEndpointOpen] = useState(false)
  const [addTableRequest, setAddTableRequest] = useState<{ schema?: string } | null>(null)
  const [databaseImportOpen, setDatabaseImportOpen] = useState(false)
  const [databaseSettingsOpen, setDatabaseSettingsOpen] = useState(false)
  const [compareHead, setCompareHead] = useState<JsonObject | null>(null)
  const [suppressions, setSuppressions] = useState<ValidationSuppression[]>(() => (
    readValidationSuppressions(document.canvas)
  ))
  const [nodeEditRequest, setNodeEditRequest] = useState<NodeEditRequest | null>(null)
  const editRequestToken = useRef(0)
  const flowRef = useRef<HTMLDivElement>(null)
  const { fitView } = useReactFlow()
  const [displayState, setDisplayState] = useState<CanvasDisplayState>(() => (
    readDisplayState(document.id, profile.id)
  ))
  const [revealedCardIds, setRevealedCardIds] = useState<string[]>([])

  useEffect(() => {
    writeDisplayState(document.id, displayState)
  }, [displayState, document.id])

  const rawNodes = useMemo(() => nodes.map((node) => node.data.raw), [nodes])
  const rawEdges = useMemo(
    () => edges.flatMap((edge) => (edge.data?.raw ? [edge.data.raw] : [])),
    [edges],
  )
  const apiReference = useMemo(
    () => (isApi ? buildApiReferenceDocument(rawNodes) : null),
    [isApi, rawNodes],
  )
  const displayView = useMemo(() => computeDisplay({
    nodes: rawNodes,
    edges: rawEdges,
    state: displayState,
    selectedIds: new Set(nodes.filter((node) => node.selected).map((node) => node.id)),
    revealedCardIds: new Set(revealedCardIds),
    ontology,
    apiReference,
  }), [apiReference, displayState, nodes, ontology, rawEdges, rawNodes, revealedCardIds])
  const drawnNodes = useMemo(() => (
    isDatabase
      ? nodes.filter((node) => node.data.entity?.entityType !== 'database_definition')
      : nodes
  ), [isDatabase, nodes])
  const visibleNodes = useMemo(() => {
    const ids = displayView.visibleNodeIds
    return drawnNodes.filter((node) => ids.has(node.id))
  }, [displayView.visibleNodeIds, drawnNodes])
  const visibleEdges = useMemo(() => {
    const ids = new Set(displayView.edges.map((edge) => edge.id))
    const nodeIds = new Set(visibleNodes.map((node) => node.id))
    return edges.filter((edge) => (
      ids.has(edge.id) && nodeIds.has(edge.source) && nodeIds.has(edge.target)
    ))
  }, [displayView.edges, edges, visibleNodes])
  const revealedCardLabels = useMemo(() => revealedCardIds.flatMap((id) => {
    const node = nodes.find((candidate) => candidate.id === id)
    if (!node) return []
    const fields = node.data.entity?.fields ?? {}
    const label = String(fields.name ?? fields.title ?? node.data.label ?? '').trim()
      || (node.data.text ?? '').split('\n').find((line) => line.trim())?.replace(/^#+\s*/, '').trim()
      || id
    return [label]
  }), [nodes, revealedCardIds])

  const changeDisplayPreset = useCallback((preset: 'minimal' | 'standard' | 'all') => {
    setRevealedCardIds([])
    setDisplayState((current) => selectDisplayPreset(current, preset))
  }, [])
  const changeDisplayClass = useCallback((edgeClass: Parameters<typeof toggleDisplayClass>[1]) => {
    setRevealedCardIds([])
    setDisplayState((current) => toggleDisplayClass(current, edgeClass))
  }, [])
  const changeDisplayCardType = useCallback((typeId: string) => {
    setRevealedCardIds([])
    setDisplayState((current) => toggleDisplayCardType(current, typeId))
  }, [])
  const resetDisplay = useCallback(() => {
    setRevealedCardIds([])
    setDisplayState(resetDisplayState(document.id, profile.id))
  }, [document.id, profile.id])

  const {
    title,
    renameOpen,
    setRenameOpen,
    renameBusy,
    baseCanvas,
    reviewMode,
    changeReviewMode,
    districtsEnabled,
    changeDistrictsEnabled,
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
    reviewModesEnabled: profile.id !== 'raw',
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
    nodes: visibleNodes,
    title,
    footer: `${displayPresetLabel(displayState.preset)} display`,
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
  })

  const openDatabaseSettings = useCallback(() => setDatabaseSettingsOpen(true), [])

  const validation = useCanvasValidation({
    client,
    nodes,
    edges,
    baseCanvas,
    profile,
    ontology,
    isSystems: isStructured,
    isApi,
    isSystemsCanvas: isSystems,
    districtsEnabled,
    reviewMode,
    suppressions,
    setSuppressions,
    setNodes,
    setEdges,
    selectEdge: graph.selectEdge,
    markDirty,
    setNotice,
    onOpenDatabaseSettings: openDatabaseSettings,
    onRevealCards: (ids) => {
      const hiddenIds = ids.filter((id) => {
        const node = nodes.find((candidate) => candidate.id === id)
        const typeId = node ? displayCardTypeId(node.data.raw) : null
        return Boolean(typeId && displayState.hiddenCardTypes.includes(typeId))
      })
      setRevealedCardIds(hiddenIds)
    },
  })

  useEffect(() => observeHistory({ nodes, edges }), [edges, nodes, observeHistory])

  const guardExport = useCallback((label: string, run: () => void) => {
    if (validation.publishBlockingIssues.length > 0) setBlockedExport({ label, run })
    else run()
  }, [validation.publishBlockingIssues.length])

  const openLevelInViews = useCallback((level: LevelNumber) => {
    setViewsLevel(level)
    setViewsOpen(true)
  }, [])

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

  const showInCanvas = useCallback((id: string) => {
    setViewsOpen(false)
    setViewsLevel(undefined)
    openNodeEditor(id)
  }, [openNodeEditor])

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
    const base = makeEntityNode('schema', { x: 0, y: 0 }, ontology)
    if (!base) return { ok: false, error: 'Could not create the Schema card.' }
    const draft = { ...base, id: schemaId } as CanvasNode
    const placement = graph.placementPosition(draft, {
      extraEdges: [{
        id: `place:${schemaId}`,
        fromNode: artifactId,
        toNode: schemaId,
        app: { relationType: 'uses' },
      } as CanvasEdge],
    })
    const schemaFields = { ...(base.app?.fields ?? {}), ...extracted.schema }
    const schemaText = renderEntityMarkdown(schemaType, schemaFields)
    const created = {
      ...draft,
      x: placement.position.x,
      y: placement.position.y,
      app: { ...(draft.app ?? {}), entityType: 'schema', fields: schemaFields },
      text: schemaText,
    } as CanvasNode
    setNodes((current) => applyPlacementToNodes(
      insertNodes(
        current.map((node) => (
          node.id === artifactId ? withEntityFields(node, extracted.artifact, ontology) : node
        )),
        [{ ...toFlowNode(created), selected: true }],
      ),
      placement,
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

  useApiManagedRelations({
    nodes,
    setEdges,
    enabled: isApi,
  })

  useDatabaseManagedRelations({
    nodes,
    setEdges,
    enabled: isDatabase,
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

  const exportDatabase = useCallback(() => ({
    text: exportDatabaseDdl(fromFlowCanvas(nodes, edges, baseCanvas)),
    filename: `${titleSlug(title)}.sql`,
  }), [baseCanvas, edges, nodes, title])

  const onExportDatabase = useCallback(() => {
    try {
      const output = exportDatabase()
      downloadText(output.filename, output.text, 'application/sql')
      setNotice(`Exported ${output.filename}.`)
    } catch (cause) {
      reportExportFailure(cause)
    }
  }, [exportDatabase, reportExportFailure, setNotice])

  const onCopyDatabase = useCallback(() => {
    try {
      const output = exportDatabase()
      void navigator.clipboard.writeText(output.text)
        .then(() => setNotice('Copied PostgreSQL DDL.'))
        .catch(() => setError('Clipboard access was denied.'))
    } catch (cause) {
      reportExportFailure(cause)
    }
  }, [exportDatabase, reportExportFailure, setError, setNotice])

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

  const addEndpoint = useCallback((input: AddApiEndpointInput): string[] => {
    const canvas = fromFlowCanvas(nodes, edges, baseCanvas)
    const sizes = Object.fromEntries(nodes.map((node) => [node.id, nodeDimensions(node)]))
    const result = addApiEndpoint(canvas, input, sizes)
    if (result.errors.length > 0) return result.errors
    const byId = new Map(result.nodes.map((node) => [node.id, node]))
    setNodes((current) => {
      const currentIds = new Set(current.map((node) => node.id))
      return [
        ...current.map((node) => {
          const raw = byId.get(node.id)
          if (!raw) return node
          return { ...toFlowNode(raw), selected: false }
        }),
        ...result.nodes
          .filter((node) => !currentIds.has(node.id))
          .map((node) => ({ ...toFlowNode(node), selected: node.id === result.endpointId })),
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
    setNotice(`Added ${input.method.trim().toUpperCase()} ${input.path.trim()}.`)
    window.setTimeout(() => {
      void fitView({
        nodes: [{ id: result.endpointId }],
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

  const applyDatabaseCanvas = useCallback((next: JsonCanvas) => {
    const byId = new Map((next.nodes ?? []).map((node) => [node.id, node]))
    setNodes((current) => current.map((node) => {
      const raw = byId.get(node.id)
      if (!raw) return node
      const entity = getEntityMeta(raw)
      const entityType = entity ? findEntityType(ontology, entity.entityType) : undefined
      const text = entity && entityType
        ? renderEntityMarkdown(entityType, entity.fields)
        : node.data.text
      return {
        ...node,
        data: {
          ...node.data,
          raw,
          entity,
          text,
        },
      }
    }))
    setEdges((next.edges ?? []).map((edge) => toFlowEdge(edge, ontology)))
  }, [ontology, setEdges, setNodes])

  const addDatabaseReference = useCallback((connection: DatabaseReferenceConnection): boolean => {
    const canvas = fromFlowCanvas(nodes, edges, baseCanvas)
    const next = addReferenceToCanvas(canvas, connection)
    if (next === canvas) {
      setNotice('Could not add the foreign key. Check that both columns still exist.')
      return true
    }
    applyDatabaseCanvas(next)
    markDirty()
    setNotice(`Added foreign key ${connection.fromColumn} → ${connection.toColumn}.`)
    return true
  }, [applyDatabaseCanvas, baseCanvas, edges, markDirty, nodes, setNotice])

  const removeDatabaseReference = useCallback((edgeId: string) => {
    const canvas = fromFlowCanvas(nodes, edges, baseCanvas)
    const edge = (canvas.edges ?? []).find((candidate) => candidate.id === edgeId)
    if (!edge) return
    const next = removeReferenceFromCanvas(canvas, edge)
    applyDatabaseCanvas(next)
    markDirty()
    setNotice('Removed the foreign key.')
  }, [applyDatabaseCanvas, baseCanvas, edges, markDirty, nodes, setNotice])

  const dismissNotice = useCallback(() => setNotice(''), [setNotice])

  const addTable = useCallback((input: AddDatabaseTableInput): string[] => {
    const canvas = fromFlowCanvas(nodes, edges, baseCanvas)
    const result = addDatabaseTable(canvas, input)
    if (result.errors.length > 0) return result.errors
    const additions = result.nodes.map((node) => ({
      ...toFlowNode(node),
      selected: node.app?.entityType === 'table',
    }))
    const schemaUpdates = new Map(result.schemaUpdates.map((node) => [node.id, node]))
    setNodes((current) => [
      ...current.map((node) => {
        const raw = schemaUpdates.get(node.id)
        return raw
          ? { ...toFlowNode(raw), selected: false }
          : { ...node, selected: false }
      }),
      ...additions,
    ])
    markDirty()
    setNotice(`Added table ${input.schema.trim() || 'public'}.${input.name.trim()}.`)
    window.setTimeout(() => {
      void fitView({
        nodes: additions.map((node) => ({ id: node.id })),
        padding: 0.2,
        maxZoom: 1.2,
        duration: 300,
      })
    }, 0)
    return []
  }, [baseCanvas, edges, fitView, markDirty, nodes, setNodes, setNotice])

  const openAddTable = useCallback((schema?: string) => {
    setAddTableRequest(schema === undefined ? {} : { schema })
  }, [])

  const importDatabaseIntoCanvas = useCallback(async (result: DatabaseImportResult) => {
    const importedNodes = result.canvas.nodes ?? []
    const importedEdges = result.canvas.edges ?? []
    setNodes(importedNodes.map((node) => ({ ...toFlowNode(node), selected: false })))
    setEdges(importedEdges.map((edge) => toFlowEdge(edge, ontology)))
    setDatabaseImportOpen(false)
    markDirty()
    setNotice(`Imported ${importedNodes.filter((node) => node.app?.entityType === 'table').length} tables into this canvas.`)
    window.setTimeout(() => {
      void fitView({ padding: 0.25, maxZoom: 1.2, duration: 300 })
    }, 0)
  }, [fitView, markDirty, ontology, setEdges, setNodes, setNotice])

  const saveDatabaseSettings = useCallback((fields: EntityFields) => {
    const entityType = findEntityType(ontology, 'database_definition')
    if (!entityType) {
      setError('The Database card type is unavailable.')
      return
    }
    setNodes((current) => {
      const existing = current.find((node) => (
        node.data.entity?.entityType === 'database_definition'
      ))
      if (existing) {
        return current.map((node) => (
          node.id === existing.id ? withEntityFields(node, fields, ontology) : node
        ))
      }
      const raw = makeEntityNode('database_definition', { x: 0, y: 0 }, ontology)
      if (!raw) return current
      raw.app = { ...(raw.app ?? {}), entityType: 'database_definition', fields }
      raw.text = renderEntityMarkdown(entityType, fields)
      return [...current, { ...toFlowNode(raw), selected: false }]
    })
    setDatabaseSettingsOpen(false)
    markDirty()
  }, [markDirty, ontology, setError, setNodes])

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
      createOrOpenProfileCanvas: links.createOrOpenProfileCanvas,
      openNodeEditor,
      addDatabaseReference,
      removeDatabaseReference,
      openAddTable,
      extractSchemaCard,
      inlineSchemaCard,
    }),
    [
      addDatabaseReference,
      extractSchemaCard,
      graph.autoFitNode,
      graph.openEdgeLabelEditor,
      graph.resizeNode,
      graph.selectEdge,
      graph.updateLabel,
      graph.updateText,
      inlineSchemaCard,
      links.createOrOpenProfileCanvas,
      links.openCanvasLinks,
      openAddTable,
      openNodeEditor,
      removeDatabaseReference,
      updateEntityField,
    ],
  )

  const commands = useCanvasCommands({
    backLabel: trail.length > 1 ? 'Back' : 'All canvases',
    isSystems: isStructured,
    profileId: profile.id,
    issueCount: validation.validationIssues.length,
    errorCount: validation.validationIssues.filter((issue) => issue.severity === 'error').length,
    canUndo: graph.canUndo,
    canRedo: graph.canRedo,
    resourceCount: apiReference?.resources.length ?? 0,
    availableEntityTypes,
    onBack: () => void back(),
    onRename: () => setRenameOpen(true),
    onAddNote: graph.addNoteAtCenter,
    onAddCard: graph.addAtCenter,
    onAddEntity: (entityTypeId) => {
      if (isDatabase && entityTypeId === 'table') {
        setAddTableRequest({})
        return
      }
      if (isApi && entityTypeId === 'endpoint') {
        setAddEndpointOpen(true)
        return
      }
      graph.addEntityAtCenter(entityTypeId)
    },
    onViews: () => {
      setViewsLevel(undefined)
      setViewsOpen(true)
    },
    onReview: validation.openReview,
    onUndo: graph.undo,
    onRedo: graph.redo,
    onSave: () => { void save() },
    onReplan: graph.replanLayout,
    onTidyApi: graph.autoLayoutApi,
    onTidyDatabase: graph.autoLayoutDatabase,
    onFitCards: graph.autoFitAll,
    onFitView: graph.fitCanvas,
    onDownload: () => guardExport('Canvas export', () => { void download() }),
    onScreenshot: () => guardExport('View image', capture.openScreenshot),
    onAddResource: () => setAddResourceOpen(true),
    onStandardErrors: standardErrors,
    selectedEndpointCount,
    onExportOpenApi: (format) => guardExport('OpenAPI export', () => onExportOpenApi(format)),
    onCopyOpenApi: (format) => guardExport('OpenAPI copy', () => onCopyOpenApi(format)),
    onExportDatabase: () => guardExport('DDL export', onExportDatabase),
    onCopyDatabase: () => guardExport('DDL copy', onCopyDatabase),
    onDatabaseSettings: openDatabaseSettings,
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
      else if (graph.connectNodeId) graph.setConnectNodeId(null)
      else graph.clearSelection()
    },
  })

  useEditorShortcuts(commands)

  const databaseDefinition = nodes.find((node) => (
    node.data.entity?.entityType === 'database_definition'
  ))
  const databaseDefinitionType = findEntityType(ontology, 'database_definition')

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
            display={{
              state: displayState,
              cardTypes: displayCardTypes(drawnNodes.map((node) => node.data.raw), ontology),
              hiddenCards: displayView.hiddenCards,
              hiddenEdges: displayView.hiddenEdges,
              revealedCardLabels,
              onChangePreset: changeDisplayPreset,
              onToggleClass: changeDisplayClass,
              onToggleCardType: changeDisplayCardType,
              onReset: resetDisplay,
            }}
            notice={notice}
            onDismissNotice={dismissNotice}
            error={error}
          />
          <DatabaseDesignProvider nodes={rawNodes} enabled={isDatabase}>
          <ApiDesignProvider nodes={nodes} enabled={isApi}>
            <NodeEditRequestContext.Provider value={nodeEditRequest}>
            <CanvasWorkspace
            client={client}
            documentId={document.id}
            nodes={visibleNodes}
            edges={visibleEdges}
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
            reviewMode={reviewMode}
            onReviewModeChange={changeReviewMode}
            districtsEnabled={districtsEnabled}
            onDistrictsEnabledChange={changeDistrictsEnabled}
            onOpenLevel={openLevelInViews}
            showDatabaseEmptyPanel={isDatabase && visibleNodes.length === 0}
            onAddTableFromEmpty={() => setAddTableRequest({})}
            onAddEnumFromEmpty={() => graph.addEntityAtCenter('db_enum')}
            onImportDdlFromEmpty={() => setDatabaseImportOpen(true)}
            />
            </NodeEditRequestContext.Provider>
          </ApiDesignProvider>
          </DatabaseDesignProvider>
          <EditorDialogs
            documentId={document.id}
            title={title}
            nodes={nodes}
            edges={edges}
            ontology={ontology}
            isSystems={isSystems || isApi}
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
            viewsLevel={viewsLevel}
            onShowInCanvas={showInCanvas}
            guardExport={guardExport}
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
          {addEndpointOpen && (
            <AddEndpointDialog
              resources={apiReference?.resources ?? []}
              initialResourceId={graph.selectedNodes.find((node) => (
                node.data.entity?.entityType === 'resource'
              ))?.id}
              onSubmit={addEndpoint}
              onClose={() => setAddEndpointOpen(false)}
            />
          )}
          {addTableRequest && (
            <AddTableDialog
              initialSchema={addTableRequest.schema}
              schemas={Array.from(new Set([
                'public',
                ...nodes.flatMap((node) => {
                  if (node.data.entity?.entityType === 'db_schema') {
                    return [String(node.data.entity.fields.name ?? '')]
                  }
                  if (node.data.entity?.entityType === 'table') {
                    return [String(node.data.entity.fields.schema ?? 'public')]
                  }
                  return []
                }),
              ])).filter(Boolean)}
              onSubmit={addTable}
              onClose={() => setAddTableRequest(null)}
            />
          )}
          <DatabaseImportDialog
            open={databaseImportOpen}
            confirmLabel="Import into canvas"
            busyLabel="Importing DDL"
            onCreate={importDatabaseIntoCanvas}
            onClose={() => setDatabaseImportOpen(false)}
          />
          {databaseSettingsOpen && databaseDefinitionType && (
            <DatabaseSettingsDialog
              entityType={databaseDefinitionType}
              initialFields={databaseDefinition?.data.entity?.fields ?? {
                ...emptyEntityFields(databaseDefinitionType),
                name: title.trim() || 'Database',
              }}
              onSave={saveDatabaseSettings}
              onClose={() => setDatabaseSettingsOpen(false)}
            />
          )}
          {blockedExport && (
            <PublishBlockedDialog
              label={blockedExport.label}
              issues={validation.publishBlockingIssues}
              onShow={(issue) => {
                setBlockedExport(null)
                setViewsOpen(false)
                validation.openValidationIssue(issue)
              }}
              onIgnore={(issue, reason) => validation.ignoreValidationIssue(issue, reason)}
              onClose={() => setBlockedExport(null)}
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
