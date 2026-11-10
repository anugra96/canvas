import { useCallback, useState } from 'react'

import {
  emptyEntityFields,
  findEntityType,
  getCanvasLinks,
  renderEntityMarkdown,
  type CanvasDocument,
  type CanvasLink,
  type CanvasNode,
  type CanvasSummary,
  type Ontology,
} from '@canvas/contract'

import type { CanvasClient } from '../../../api/client'
import { toFlowNode, type CanvasFlowNode } from '../../model/adapter'
import { createCanvasLink, withCanvasLinks } from '../../model/canvasLinks'
import { insertNodes } from '../../model/insertNodes'
import { makeEntityNode } from '../graph/nodes'

interface UseCanvasLinksInput {
  client: CanvasClient
  documentId: string
  profileId: string
  trail: Array<{ id: string; label: string }>
  dirty: boolean
  save: () => Promise<CanvasDocument | null>
  onOpenLinkedCanvas: (canvasId: string, label: string) => void
  onOpenTrail: (index: number) => void
  nodes: CanvasFlowNode[]
  setNodes: (update: (current: CanvasFlowNode[]) => CanvasFlowNode[]) => void
  markDirty: () => void
  setNotice: (message: string) => void
  setError: (message: string) => void
  ontology: Ontology
  placementPosition: (width: number, height: number) => { x: number; y: number; visible: boolean }
  revealPlacement: (visible: boolean) => void
}

export function useCanvasLinks({
  client,
  documentId,
  profileId,
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
}: UseCanvasLinksInput) {
  const [canvasLinkNodeId, setCanvasLinkNodeId] = useState<string | null>(null)
  const [canvasOptions, setCanvasOptions] = useState<CanvasSummary[]>([])
  const [canvasOptionsLoading, setCanvasOptionsLoading] = useState(false)
  const [canvasOptionsError, setCanvasOptionsError] = useState('')

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

  const closeCanvasLinks = useCallback(() => {
    setCanvasLinkNodeId(null)
  }, [])

  const updateCanvasLinks = useCallback((nodeId: string, update: (links: CanvasLink[]) => CanvasLink[]) => {
    setNodes((current) => current.map((node) => {
      if (node.id !== nodeId) return node
      return withCanvasLinks(node, update(getCanvasLinks(node.data.raw)))
    }))
    markDirty()
  }, [markDirty, setNodes])

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

  const createLinkedCanvas = useCallback(async (title: string) => {
    if (!canvasLinkNodeId) return
    const child = await client.createCanvas(title, profileId)
    updateCanvasLinks(canvasLinkNodeId, (links) => [...links, createCanvasLink(child.id)])
    setCanvasOptions((current) => [...current, {
      id: child.id,
      title: child.title,
      etag: child.etag,
      updatedAt: child.updatedAt,
      updatedBy: child.updatedBy,
      nodeCount: child.nodeCount,
      edgeCount: child.edgeCount,
      profile: child.canvas.app?.profile ?? profileId,
    }])
    setNotice(`Created and linked "${child.title}".`)
  }, [canvasLinkNodeId, client, profileId, setNotice, updateCanvasLinks])

  const openLinkedCanvas = useCallback(async (link: CanvasLink) => {
    if (trail.some((entry) => entry.id === link.canvasId)) {
      throw new Error('That canvas is already open in the trail.')
    }
    if (dirty) {
      const saved = await save()
      if (!saved) throw new Error('Save the current canvas before opening a linked canvas.')
    }
    onOpenLinkedCanvas(link.canvasId, link.label ?? 'Linked canvas')
  }, [dirty, onOpenLinkedCanvas, save, trail])

  const openTrail = useCallback(async (index: number) => {
    if (dirty) {
      const saved = await save()
      if (!saved) return
    }
    onOpenTrail(index)
  }, [dirty, onOpenTrail, save])

  const addProcessWithCanvas = useCallback(async () => {
    const processType = findEntityType(ontology, 'process')
    const noteType = findEntityType(ontology, 'note')
    if (!processType || !noteType) return
    setError('')
    try {
      const child = await client.createCanvas('Process documentation', profileId)
      const notes: Array<[string, string]> = [
        ['Purpose', 'Describe the process goal and trigger.'],
        ['Stages', 'Document stages, hand-offs, and owners.'],
        ['Approvals', 'Document manual approvals and gates.'],
        ['Failure handling', 'Document retries, rollback, and escalation.'],
      ]
      const noteNodes = notes.map(([name, body], index) => {
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
      await client.saveCanvas(child.id, child.etag, { ...child.canvas, nodes: noteNodes, edges: [] })

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
      setNodes((current) => insertNodes(current, [{ ...toFlowNode(raw), selected: true }]))
      markDirty()
      setNotice(`Created process card and linked "${child.title}".`)
      revealPlacement(placement.visible)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the linked process canvas.')
    }
  }, [client, markDirty, ontology, placementPosition, profileId, revealPlacement, setError, setNodes, setNotice])

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

  return {
    canvasLinkNode,
    canvasLinkNodeName,
    canvasOptions,
    canvasOptionsLoading,
    canvasOptionsError,
    currentCanvasId: documentId,
    openCanvasLinks,
    closeCanvasLinks,
    linkExistingCanvas,
    unlinkCanvas,
    relabelCanvas,
    createLinkedCanvas,
    openLinkedCanvas,
    openTrail,
    addProcessWithCanvas,
  }
}
