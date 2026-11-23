import { useReactFlow } from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  applyApiCheckFix,
  canvasEndpoints,
  deriveManagedRelations,
  emptyEntityFields,
  findEntityType,
  getCanvasLinks,
  getEdgeMeta,
  getEntityMeta,
  issueVisibleInMode,
  renderEntityMarkdown,
  type CanvasNode,
  type CanvasNodeSide,
  type CanvasProfile,
  type CanvasProfileIssue,
  type JsonCanvas,
  type Ontology,
  type ReviewMode,
} from '@canvas/contract'

import type { CanvasClient } from '../../../api/client'
import { buildSuggestions, type CanvasSuggestion } from '../../suggestions/suggestionEngine'
import { fromFlowCanvas, nodeDimensions, toFlowEdge, toFlowNode, type CanvasFlowEdge, type CanvasFlowNode } from '../../model/adapter'
import { edgeFromConnection } from '../../model/edgeRelations'
import { makeEntityNode } from '../graph/nodes'
import { applyPlacementToNodes, planPlacement } from '../graph/planPlacement'
import { prioritizeValidationIssues } from '../prioritizeIssues'
import { blockedExportIssues } from '../reviewExport'
import type { ReviewTab } from '../ReviewPanel'
import { useProfileValidation } from '../useProfileValidation'
import { validationIssueKey } from '../validationIdentity'
import {
  createSuppression,
  type IgnoreReason,
  type ValidationSuppression,
} from '../validationSuppressions'

function placementHandles(
  target: CanvasFlowNode,
  placed: CanvasNode,
): { sourceHandle: CanvasNodeSide; targetHandle: CanvasNodeSide } {
  const size = nodeDimensions(target)
  if (placed.x + placed.width <= target.position.x) {
    return { sourceHandle: 'right', targetHandle: 'left' }
  }
  if (placed.x >= target.position.x + size.width) {
    return { sourceHandle: 'left', targetHandle: 'right' }
  }
  if (placed.y + placed.height <= target.position.y) {
    return { sourceHandle: 'bottom', targetHandle: 'top' }
  }
  if (placed.y >= target.position.y + size.height) {
    return { sourceHandle: 'top', targetHandle: 'bottom' }
  }
  return placed.x < target.position.x
    ? { sourceHandle: 'right', targetHandle: 'left' }
    : { sourceHandle: 'left', targetHandle: 'right' }
}

interface UseCanvasValidationInput {
  client: CanvasClient
  nodes: CanvasFlowNode[]
  edges: CanvasFlowEdge[]
  baseCanvas: JsonCanvas
  profile: CanvasProfile
  ontology: Ontology
  isSystems: boolean
  isApi: boolean
  isSystemsCanvas: boolean
  reviewMode: ReviewMode
  suppressions: ValidationSuppression[]
  setSuppressions: (update: (current: ValidationSuppression[]) => ValidationSuppression[]) => void
  setNodes: (update: (current: CanvasFlowNode[]) => CanvasFlowNode[]) => void
  setEdges: (update: (current: CanvasFlowEdge[]) => CanvasFlowEdge[]) => void
  selectEdge: (id: string) => void
  markDirty: () => void
  setNotice: (message: string) => void
  onRevealCards?: (ids: string[]) => void
}

export function useCanvasValidation({
  client,
  nodes,
  edges,
  baseCanvas,
  profile,
  ontology,
  isSystems,
  isApi,
  isSystemsCanvas,
  reviewMode,
  suppressions,
  setSuppressions,
  setNodes,
  setEdges,
  selectEdge,
  markDirty,
  setNotice,
  onRevealCards,
}: UseCanvasValidationInput) {
  const { fitView } = useReactFlow()
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewTab, setReviewTab] = useState<ReviewTab>('issues')
  const [validationFocusRequest, setValidationFocusRequest] = useState<{ key: string; requestId: number } | null>(null)
  const validationRequestId = useRef(0)
  const [linkedEndpoints, setLinkedEndpoints] = useState<ReadonlyMap<string, readonly string[]>>(new Map())
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  const linkedEndpointsRequest = useRef(0)

  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])

  useEffect(() => {
    edgesRef.current = edges
  }, [edges])

  const loadLinkedEndpoints = useCallback(async () => {
    const request = ++linkedEndpointsRequest.current
    if (!isSystemsCanvas) {
      setLinkedEndpoints(new Map())
      return
    }
    const currentNodes = nodesRef.current
    const nodesById = new Map(currentNodes.map((node) => [node.id, node]))
    const targets = new Map<string, CanvasFlowNode>()
    for (const edge of edgesRef.current) {
      const raw = edge.data?.raw
      if (!raw || !getEdgeMeta(raw)?.endpoint?.trim()) continue
      const target = nodesById.get(edge.target)
      const entity = target ? getEntityMeta(target.data.raw) : undefined
      if (!target || entity?.entityType !== 'system' || String(entity.fields.kind ?? '') !== 'api') continue
      if (getCanvasLinks(target.data.raw).length === 0) continue
      targets.set(target.id, target)
    }
    if (targets.size === 0) {
      if (request === linkedEndpointsRequest.current) setLinkedEndpoints(new Map())
      return
    }
    let canvases
    try {
      canvases = await client.listCanvases()
    } catch {
      if (request === linkedEndpointsRequest.current) setLinkedEndpoints(new Map())
      return
    }
    const endpointsByCanvas = new Map<string, readonly string[]>()
    const next = new Map<string, readonly string[]>()
    await Promise.all([...targets.values()].map(async (target) => {
      const link = getCanvasLinks(target.data.raw).find((candidate) => (
        canvases.some((canvas) => canvas.id === candidate.canvasId && canvas.profile === 'api')
      ))
      if (!link) return
      let endpoints = endpointsByCanvas.get(link.canvasId)
      if (!endpoints) {
        try {
          const document = await client.getCanvas(link.canvasId)
          endpoints = canvasEndpoints(document.canvas)
        } catch {
          return
        }
        endpointsByCanvas.set(link.canvasId, endpoints)
      }
      next.set(target.id, endpoints)
    }))
    if (request === linkedEndpointsRequest.current) setLinkedEndpoints(next)
  }, [client, isSystemsCanvas])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadLinkedEndpoints()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadLinkedEndpoints])

  const profileValidation = useProfileValidation({
    nodes,
    edges,
    baseCanvas,
    profile,
    ontology,
    isSystems,
    isApi,
    linkedEndpoints,
  })
  const suppressionByFingerprint = useMemo(
    () => new Map(suppressions.map((suppression) => [suppression.fingerprint, suppression])),
    [suppressions],
  )
  const unsuppressedIssues = useMemo(
    () => profileValidation.issues.filter((issue) => !suppressionByFingerprint.has(validationIssueKey(issue))),
    [profileValidation.issues, suppressionByFingerprint],
  )
  const validationIssues = useMemo(
    () => unsuppressedIssues.filter((issue) => issueVisibleInMode(issue, reviewMode)),
    [reviewMode, unsuppressedIssues],
  )
  const hiddenByModeCount = unsuppressedIssues.length - validationIssues.length
  const ignoredValidationIssues = useMemo(
    () => profileValidation.issues.filter((issue) => suppressionByFingerprint.has(validationIssueKey(issue))),
    [profileValidation.issues, suppressionByFingerprint],
  )
  const publishBlockingIssues = useMemo(
    () => blockedExportIssues(reviewMode, profileValidation.issues, suppressions),
    [profileValidation.issues, reviewMode, suppressions],
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

  const focusSuggestion = useCallback((suggestion: CanvasSuggestion) => {
    const ids = new Set<string>()
    for (const item of suggestion.items) {
      if (item.action.kind === 'add-cards') {
        for (const fix of item.action.fixes) ids.add(fix.targetId)
      } else {
        ids.add(item.action.targetId)
      }
    }
    if (ids.size === 0) return
    setNotice('Moved to the affected area. Apply the fix when ready.')
    void fitView({
      nodes: [...ids].map((id) => ({ id })),
      padding: 0.35,
      maxZoom: 1.2,
      duration: 450,
    })
  }, [fitView, setNotice])

  const applySuggestion = useCallback((suggestion: CanvasSuggestion) => {
    let nextNodes = nodes
    let nextEdges = edges
    const focusIds: string[] = []
    const addedIds: string[] = []

    for (const item of suggestion.items) {
      if (item.action.kind === 'api-fix') {
        const canvas = fromFlowCanvas(nextNodes, nextEdges, baseCanvas)
        const updatedNodes = applyApiCheckFix(canvas, item.action.targetId, item.action.fix)
        const rawById = new Map(updatedNodes.map((node) => [node.id, node]))
        const currentIds = new Set(nextNodes.map((node) => node.id))
        nextNodes = nextNodes.map((node) => {
          const raw = rawById.get(node.id)
          if (!raw) return node
          const entity = getEntityMeta(raw)
          return {
            ...node,
            data: {
              ...node.data,
              raw,
              ...(entity ? { entity } : {}),
            },
          }
        })
        for (const raw of updatedNodes) {
          if (!currentIds.has(raw.id)) nextNodes.push(toFlowNode(raw))
        }
        const managed = deriveManagedRelations({ nodes: updatedNodes, edges: [] })
        nextEdges = [
          ...nextEdges.filter((edge) => (
            edge.data?.raw?.app?.managed !== true
            && edge.data?.relationType !== 'accepts'
            && edge.data?.relationType !== 'returns'
          )),
          ...managed.map((edge) => toFlowEdge(edge)),
        ]
        addedIds.push(item.action.targetId)
        focusIds.push(item.action.targetId)
        continue
      }
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
        const base = makeEntityNode(fix.entityType, { x: 0, y: 0 }, ontology)
        if (!base) continue
        const fields = { ...emptyEntityFields(entityType), name }
        const raw = {
          ...base,
          app: { ...(base.app ?? {}), fields },
          text: renderEntityMarkdown(entityType, fields),
        } as CanvasNode
        const draftEdge = edgeFromConnection({
          source: raw.id,
          target: target.id,
          sourceHandle: 'right',
          targetHandle: 'left',
        }, fix.relationType, ontology)
        const placement = planPlacement(nextNodes, nextEdges, {
          node: raw,
          extraEdges: [draftEdge],
        })
        const placed = { ...raw, x: placement.position.x, y: placement.position.y }
        const handles = placementHandles(target, placed)
        const newNode = toFlowNode(placed)
        const edge = edgeFromConnection({
          source: placed.id,
          target: target.id,
          sourceHandle: handles.sourceHandle,
          targetHandle: handles.targetHandle,
        }, fix.relationType, ontology)
        nextNodes = applyPlacementToNodes([...nextNodes, newNode], placement)
        nextEdges = [...nextEdges, toFlowEdge(edge, ontology)]
        addedIds.push(newNode.id)
        focusIds.push(target.id, newNode.id)
      }
    }

    if (addedIds.length === 0) return
    const selectedId = addedIds.at(-1)
    nextNodes = nextNodes.map((node) => ({ ...node, selected: node.id === selectedId }))
    setNodes(() => nextNodes)
    setEdges(() => nextEdges)
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
  }, [baseCanvas, edges, fitView, markDirty, nodes, ontology, setEdges, setNodes, setNotice])

  const focusValidationIssue = useCallback((issue: CanvasProfileIssue) => {
    if (issue.nodeId) {
      onRevealCards?.([issue.nodeId])
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
        onRevealCards?.([edge.source, edge.target])
        void fitView({
          nodes: [{ id: edge.source }, { id: edge.target }],
          duration: 300,
          maxZoom: 1.5,
        })
      }
    }
  }, [edges, fitView, onRevealCards, selectEdge, setEdges, setNodes])

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

  const openValidationIssue = useCallback((issue: CanvasProfileIssue) => {
    void loadLinkedEndpoints()
    focusValidationIssue(issue)
    validationRequestId.current += 1
    setValidationFocusRequest({
      key: validationIssueKey(issue),
      requestId: validationRequestId.current,
    })
    setReviewTab('issues')
    setReviewOpen(true)
  }, [focusValidationIssue, loadLinkedEndpoints])

  const openReview = useCallback(() => {
    void loadLinkedEndpoints()
    setValidationFocusRequest(null)
    setReviewOpen(true)
  }, [loadLinkedEndpoints])

  const closeReview = useCallback(() => {
    setReviewOpen(false)
    setValidationFocusRequest(null)
  }, [])

  const validation = {
    nodeIssues,
    edgeIssues,
    openIssue: openValidationIssue,
  }

  return {
    validation,
    reviewOpen,
    reviewTab,
    setReviewTab,
    openReview,
    closeReview,
    validationFocusRequest,
    validationIssues,
    hiddenByModeCount,
    publishBlockingIssues,
    levelReadiness: profileValidation.levelReadiness,
    prioritizedIssues,
    ignoredPrioritizedIssues,
    suggestions,
    ignoredReasons,
    ignoreValidationIssue,
    restoreValidationIssue,
    focusSuggestion,
    applySuggestion,
    focusValidationIssue,
    openValidationIssue,
  }
}

export type CanvasValidationEditor = ReturnType<typeof useCanvasValidation>
