import { useCallback, useEffect, useState } from 'react'

import {
  canvasReviewMode,
  mergeCanvas,
  withCanvasReviewMode,
  type CanvasDocument,
  type JsonCanvas,
  type MergeConflict,
  type Ontology,
  type ReviewMode,
} from '@canvas/contract'

import type { CanvasClient } from '../../../api/client'
import { CanvasConflictError } from '../../../api/errors'
import { fromFlowCanvas, toFlowCanvas, type CanvasFlowEdge, type CanvasFlowNode } from '../../model/adapter'
import { autosaveDelay, isNetworkFailure, useLeaveGuard } from '../saveSafety'
import type { SaveStatus } from '../CanvasToolbar'
import { readValidationSuppressions, withValidationSuppressions, type ValidationSuppression } from '../validationSuppressions'

interface UseCanvasDocumentInput {
  client: CanvasClient
  document: CanvasDocument
  ontology: Ontology
  nodes: CanvasFlowNode[]
  edges: CanvasFlowEdge[]
  suppressions: ValidationSuppression[]
  setNodes: (update: (current: CanvasFlowNode[]) => CanvasFlowNode[]) => void
  setEdges: (update: (current: CanvasFlowEdge[]) => CanvasFlowEdge[]) => void
  setSuppressions: (update: (current: ValidationSuppression[]) => ValidationSuppression[]) => void
  resetHistory: (snapshot: { nodes: CanvasFlowNode[]; edges: CanvasFlowEdge[] }) => void
  onBack: () => void
  onReloaded?: () => void
}

export function useCanvasDocument({
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
  onReloaded,
}: UseCanvasDocumentInput) {
  const [title, setTitle] = useState(document.title)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameBusy, setRenameBusy] = useState(false)
  const [baseCanvas, setBaseCanvas] = useState<JsonCanvas>(document.canvas)
  const [reviewMode, setReviewMode] = useState<ReviewMode>(() => canvasReviewMode(document.canvas))
  const [etag, setEtag] = useState(document.etag)
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState<SaveStatus>('saved')
  const [saveFailures, setSaveFailures] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [conflicts, setConflicts] = useState<MergeConflict[]>([])
  const [pendingLocal, setPendingLocal] = useState<JsonCanvas | null>(null)

  const markDirty = useCallback(() => {
    setDirty(true)
    setStatus('dirty')
    setNotice('')
  }, [])

  const currentCanvas = useCallback(
    (nodeList = nodes, edgeList = edges, base = baseCanvas) =>
      withCanvasReviewMode(
        withValidationSuppressions(fromFlowCanvas(nodeList, edgeList, base), suppressions),
        reviewMode,
      ),
    [baseCanvas, edges, nodes, reviewMode, suppressions],
  )

  const changeReviewMode = useCallback((mode: ReviewMode) => {
    setReviewMode(mode)
    markDirty()
  }, [markDirty])

  const save = useCallback(async (canvasOverride?: JsonCanvas, etagOverride?: string) => {
    const local = canvasOverride ?? currentCanvas()
    setStatus('saving')
    setError('')
    try {
      const saved = await client.saveCanvas(document.id, etagOverride ?? etag, local)
      setEtag(saved.etag)
      setBaseCanvas(saved.canvas)
      setReviewMode(canvasReviewMode(saved.canvas))
      setSuppressions(() => readValidationSuppressions(saved.canvas))
      setDirty(false)
      setStatus('saved')
      setSaveFailures(0)
      setNotice('')
      setConflicts([])
      setPendingLocal(null)
      return saved
    } catch (cause) {
      if (cause instanceof CanvasConflictError) {
        const merged = mergeCanvas(baseCanvas, local, cause.latest.canvas)
        const flow = toFlowCanvas(merged.canvas, ontology)
        setNodes(() => flow.nodes)
        setEdges(() => flow.edges)
        resetHistory(flow)
        setBaseCanvas(cause.latest.canvas)
        setEtag(cause.latest.etag)
        setReviewMode(canvasReviewMode(merged.canvas))
        setSuppressions(() => readValidationSuppressions(merged.canvas))
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
      setSaveFailures((count) => count + 1)
      if (isNetworkFailure(cause)) {
        setStatus('offline')
        return null
      }
      setError(cause instanceof Error ? cause.message : 'Could not save the canvas.')
      setStatus('error')
      return null
    }
  }, [
    baseCanvas,
    client,
    currentCanvas,
    document.id,
    etag,
    ontology,
    resetHistory,
    setEdges,
    setNodes,
    setSuppressions,
  ])

  useEffect(() => {
    if (!dirty || status === 'saving' || conflicts.length > 0) return
    const timer = window.setTimeout(() => {
      void save()
    }, autosaveDelay(saveFailures))
    return () => window.clearTimeout(timer)
  }, [baseCanvas, dirty, edges, nodes, save, saveFailures, status, conflicts.length])

  useLeaveGuard(dirty || status === 'saving' || conflicts.length > 0, () => {
    if (dirty && status !== 'saving' && conflicts.length === 0) void save()
  })

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

  async function reloadLatest() {
    setError('')
    try {
      const latest = await client.getCanvas(document.id)
      const flow = toFlowCanvas(latest.canvas, ontology)
      setNodes(() => flow.nodes)
      setEdges(() => flow.edges)
      resetHistory(flow)
      setBaseCanvas(latest.canvas)
      setEtag(latest.etag)
      setReviewMode(canvasReviewMode(latest.canvas))
      setSuppressions(() => readValidationSuppressions(latest.canvas))
      setConflicts([])
      setPendingLocal(null)
      setDirty(false)
      setStatus('saved')
      setNotice('Loaded the latest saved canvas.')
      onReloaded?.()
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

  return {
    title,
    renameOpen,
    setRenameOpen,
    renameBusy,
    baseCanvas,
    reviewMode,
    changeReviewMode,
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
  }
}
