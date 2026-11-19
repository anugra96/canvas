import { useCallback, useState } from 'react'

import {
  getCanvasLinks,
  type CanvasDocument,
  type CanvasLink,
  type CanvasSummary,
} from '@canvas/contract'

import type { CanvasClient } from '../../../api/client'
import type { CanvasFlowNode } from '../../model/adapter'
import { createCanvasLink, withCanvasLinks } from '../../model/canvasLinks'

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

  const createOrOpenApiCanvas = useCallback(async (nodeId: string, cardTitle: string) => {
    const node = nodes.find((candidate) => candidate.id === nodeId)
    if (!node) return
    if (dirty) {
      const saved = await save()
      if (!saved) return
    }
    setError('')
    try {
      const links = getCanvasLinks(node.data.raw)
      const canvases = await client.listCanvases()
      const linkedApi = links.find((link) => (
        canvases.some((canvas) => canvas.id === link.canvasId && canvas.profile === 'api')
      ))
      if (linkedApi) {
        onOpenLinkedCanvas(linkedApi.canvasId, linkedApi.label ?? 'API canvas')
        return
      }
      const child = await client.createCanvas(cardTitle, 'api')
      updateCanvasLinks(nodeId, (current) => [...current, createCanvasLink(child.id, 'API canvas')])
      setNotice(`Created API canvas "${child.title}" and linked it to this card.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the API canvas.')
    }
  }, [client, dirty, nodes, onOpenLinkedCanvas, save, setError, setNotice, updateCanvasLinks])

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
    createOrOpenApiCanvas,
    closeCanvasLinks,
    linkExistingCanvas,
    unlinkCanvas,
    relabelCanvas,
    createLinkedCanvas,
    openLinkedCanvas,
    openTrail,
  }
}

export type CanvasLinksState = ReturnType<typeof useCanvasLinks>
