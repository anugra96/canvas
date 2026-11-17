import { useReactFlow } from '@xyflow/react'
import { useCallback, useMemo, useRef, useState } from 'react'

import {
  applyApiCheckFix,
  deriveManagedRelations,
  emptyEntityFields,
  findEntityType,
  getEntityMeta,
  renderEntityMarkdown,
  type CanvasNode,
  type CanvasNodeSide,
  type CanvasProfile,
  type CanvasProfileIssue,
  type JsonCanvas,
  type Ontology,
} from '@canvas/contract'

import { buildSuggestions, type CanvasSuggestion } from '../../suggestions/suggestionEngine'
import { fromFlowCanvas, nodeDimensions, toFlowEdge, toFlowNode, type CanvasFlowEdge, type CanvasFlowNode } from '../../model/adapter'
import { edgeFromConnection } from '../../model/edgeRelations'
import { makeEntityNode } from '../graph/nodes'
import { prioritizeValidationIssues } from '../prioritizeIssues'
import type { ReviewTab } from '../ReviewPanel'
import { useProfileValidation } from '../useProfileValidation'
import { validationIssueKey } from '../validationIdentity'
import {
  createSuppression,
  type IgnoreReason,
  type ValidationSuppression,
} from '../validationSuppressions'

function suggestedPlacement(
target: CanvasFlowNode,
width: number,
height: number,
nodeList: CanvasFlowNode[],
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

interface UseCanvasValidationInput {
  nodes: CanvasFlowNode[]
  edges: CanvasFlowEdge[]
  baseCanvas: JsonCanvas
  profile: CanvasProfile
  ontology: Ontology
  isSystems: boolean
  isApi: boolean
  suppressions: ValidationSuppression[]
  setSuppressions: (update: (current: ValidationSuppression[]) => ValidationSuppression[]) => void
  setNodes: (update: (current: CanvasFlowNode[]) => CanvasFlowNode[]) => void
  setEdges: (update: (current: CanvasFlowEdge[]) => CanvasFlowEdge[]) => void
  selectEdge: (id: string) => void
  markDirty: () => void
  setNotice: (message: string) => void
}

export function useCanvasValidation({
  nodes,
  edges,
  baseCanvas,
  profile,
  ontology,
  isSystems,
  isApi,
  suppressions,
  setSuppressions,
  setNodes,
  setEdges,
  selectEdge,
  markDirty,
  setNotice,
}: UseCanvasValidationInput) {
  const { fitView } = useReactFlow()
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewTab, setReviewTab] = useState<ReviewTab>('issues')
  const [validationFocusRequest, setValidationFocusRequest] = useState<{ key: string; requestId: number } | null>(null)
  const validationRequestId = useRef(0)

  const allValidationIssues = useProfileValidation({
    nodes,
    edges,
    baseCanvas,
    profile,
    ontology,
    isSystems,
    isApi,
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
  }, [edges, fitView, selectEdge, setEdges, setNodes])

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
    focusValidationIssue(issue)
    validationRequestId.current += 1
    setValidationFocusRequest({
      key: validationIssueKey(issue),
      requestId: validationRequestId.current,
    })
    setReviewTab('issues')
    setReviewOpen(true)
  }, [focusValidationIssue])

  const openReview = useCallback(() => {
    setValidationFocusRequest(null)
    setReviewOpen(true)
  }, [])

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
