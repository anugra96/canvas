import { useReactFlow } from '@xyflow/react'
import { useCallback, useMemo, useState } from 'react'

import type { AlignmentGuide } from '../../model/alignment'
import {
  estimateDatabaseSizes,
  layoutApiCanvas,
  layoutDatabaseCanvas,
  planLayout,
  type GroupResize,
  type LayoutMove,
  type Sizes,
} from '@canvas/contract'
import {
  fromFlowCanvas,
  nodeDimensions,
  type CanvasFlowEdge,
  type CanvasFlowNode,
} from '../../model/adapter'
import { findBestCardSize } from '../autoFit'

interface UseCanvasLayoutInput {
  nodes: CanvasFlowNode[]
  edges: CanvasFlowEdge[]
  setNodes: (update: (current: CanvasFlowNode[]) => CanvasFlowNode[]) => void
  setAlignmentGuides: (guides: AlignmentGuide[]) => void
  markDirty: () => void
  setNotice: (message: string) => void
  flowRef: React.RefObject<HTMLDivElement | null>
}

export interface LayoutPreviewRect {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export interface LayoutPreviewLink {
  id: string
  from: { x: number; y: number }
  to: { x: number; y: number }
}

export interface LayoutPreview {
  moves: LayoutMove[]
  groupResizes: GroupResize[]
  cards: LayoutPreviewRect[]
  groups: LayoutPreviewRect[]
  links: LayoutPreviewLink[]
  signature: string
}

interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

const MOVEMENT_EPSILON = 0.5

function layoutSignature(nodes: CanvasFlowNode[], edges: CanvasFlowEdge[]): string {
  return JSON.stringify({
    nodes: nodes.map((node) => {
      const size = nodeDimensions(node)
      return {
        id: node.id,
        x: node.position.x,
        y: node.position.y,
        width: size.width,
        height: size.height,
        raw: node.data.raw,
      }
    }),
    edges: edges.map((edge) => ({
      id: edge.id,
      from: edge.source,
      to: edge.target,
      raw: edge.data?.raw,
    })),
  })
}

function unionBounds(rects: Bounds[]): Bounds | undefined {
  if (rects.length === 0) return undefined
  const left = Math.min(...rects.map((rect) => rect.x))
  const top = Math.min(...rects.map((rect) => rect.y))
  const right = Math.max(...rects.map((rect) => rect.x + rect.width))
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

export function useCanvasLayout({
  nodes,
  edges,
  setNodes,
  setAlignmentGuides,
  markDirty,
  setNotice,
  flowRef,
}: UseCanvasLayoutInput) {
  const { fitView, fitBounds } = useReactFlow()
  const [preview, setPreview] = useState<LayoutPreview | null>(null)
  // Only serialise the canvas while a preview is open; dragging with no preview stays cheap.
  const previewSignature = useMemo(() => (preview ? layoutSignature(nodes, edges) : ''), [edges, nodes, preview])
  const activePreview = preview && preview.signature === previewSignature ? preview : null

  const replanLayout = useCallback(() => {
    const sizes: Sizes = Object.fromEntries(nodes.map((node) => [node.id, nodeDimensions(node)]))
    const plan = planLayout(fromFlowCanvas(nodes, edges, {}), { kind: 'replan' }, sizes)
    const nodeById = new Map(nodes.map((node) => [node.id, node]))
    const moves = plan.moves.filter((move) => (
      Math.abs(move.to.x - move.from.x) >= MOVEMENT_EPSILON
      || Math.abs(move.to.y - move.from.y) >= MOVEMENT_EPSILON
    ))
    const groupChanges = plan.groupResizes.filter((resize) => {
      const node = nodeById.get(resize.id)
      if (!node || node.type !== 'group') return false
      const size = nodeDimensions(node)
      return Math.abs(resize.x - node.position.x) >= MOVEMENT_EPSILON
        || Math.abs(resize.y - node.position.y) >= MOVEMENT_EPSILON
        || Math.abs(resize.width - size.width) >= MOVEMENT_EPSILON
        || Math.abs(resize.height - size.height) >= MOVEMENT_EPSILON
    })

    if (moves.length === 0 && groupChanges.length === 0) {
      setPreview(null)
      setNotice('Layout is already tidy.')
      return
    }

    const cards = moves.flatMap((move) => {
      const node = nodeById.get(move.id)
      if (!node) return []
      const size = nodeDimensions(node)
      return [{ id: move.id, x: move.to.x, y: move.to.y, width: size.width, height: size.height }]
    })
    const groups = plan.groupResizes.map((resize) => ({ ...resize }))
    const links = moves.flatMap((move) => {
      const node = nodeById.get(move.id)
      if (!node) return []
      const size = nodeDimensions(node)
      return [{
        id: move.id,
        from: {
          x: node.position.x + size.width / 2,
          y: node.position.y + size.height / 2,
        },
        to: {
          x: move.to.x + size.width / 2,
          y: move.to.y + size.height / 2,
        },
      }]
    })
    const bounds = unionBounds([
      ...nodes.map((node) => {
        const size = nodeDimensions(node)
        return {
          x: node.position.x,
          y: node.position.y,
          width: size.width,
          height: size.height,
        }
      }),
      ...cards,
      ...groups,
    ])
    setPreview({
      moves,
      groupResizes: plan.groupResizes,
      cards,
      groups,
      links,
      signature: layoutSignature(nodes, edges),
    })
    if (bounds) {
      void fitBounds(bounds, { padding: 0.2, duration: 300 })
    }
  }, [edges, fitBounds, nodes, setNotice])

  const applyLayoutPreview = useCallback(() => {
    if (!activePreview) return
    const moves = new Map<string, LayoutMove>(activePreview.moves.map((move) => [move.id, move]))
    const resizes = new Map<string, GroupResize>(
      activePreview.groupResizes.map((resize) => [resize.id, resize]),
    )
    const allNodeIds = nodes.map((node) => ({ id: node.id }))
    setNodes((current) => current.map((node) => {
      const move = moves.get(node.id)
      const resize = resizes.get(node.id)
      if (!move && !resize) return node
      if (resize && node.type === 'group') {
        return {
          ...node,
          position: { x: resize.x, y: resize.y },
          style: { ...node.style, width: resize.width, height: resize.height },
          data: {
            ...node.data,
            raw: {
              ...node.data.raw,
              x: resize.x,
              y: resize.y,
              width: resize.width,
              height: resize.height,
            },
          },
        }
      }
      if (!move) return node
      return {
        ...node,
        position: move.to,
        data: { ...node.data, raw: { ...node.data.raw, x: move.to.x, y: move.to.y } },
      }
    }))
    setAlignmentGuides([])
    markDirty()
    setPreview(null)
    setNotice(`Layout applied: ${activePreview.moves.length} card${activePreview.moves.length === 1 ? '' : 's'} moved.`)
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        void fitView({
          nodes: allNodeIds,
          padding: 0.2,
          maxZoom: 1.2,
          duration: 300,
        })
      })
    })
  }, [activePreview, fitView, markDirty, nodes, setAlignmentGuides, setNodes, setNotice])

  const cancelLayoutPreview = useCallback(() => setPreview(null), [])

  const autoLayoutApi = useCallback(() => {
    const sizes = Object.fromEntries(nodes.map((node) => [node.id, nodeDimensions(node)]))
    const rawNodes = nodes.map((node) => node.data.raw)
    const rawEdges = edges.flatMap((edge) => edge.data?.raw ? [edge.data.raw] : [])
    const laidOut = layoutApiCanvas({ nodes: rawNodes, edges: rawEdges }, sizes)
    const byId = new Map((laidOut.nodes ?? []).map((node) => [node.id, node]))
    setNodes((current) => current.map((node) => {
      const next = byId.get(node.id)
      if (!next) return node
      return {
        ...node,
        position: { x: next.x, y: next.y },
        style: { ...node.style, width: next.width, height: next.height },
        data: { ...node.data, raw: { ...node.data.raw, x: next.x, y: next.y, width: next.width, height: next.height } },
      }
    }))
    setAlignmentGuides([])
    setNotice('API layout applied.')
    markDirty()
    window.setTimeout(() => {
      void fitView({ padding: 0.2, maxZoom: 1.2, duration: 300 })
    }, 0)
  }, [edges, fitView, markDirty, nodes, setAlignmentGuides, setNodes, setNotice])

  const autoLayoutDatabase = useCallback(() => {
    const rawNodes = nodes.map((node) => node.data.raw)
    const rawEdges = edges.flatMap((edge) => edge.data?.raw ? [edge.data.raw] : [])
    const canvas = { nodes: rawNodes, edges: rawEdges }
    const laidOut = layoutDatabaseCanvas(canvas, estimateDatabaseSizes(canvas))
    const byId = new Map((laidOut.nodes ?? []).map((node) => [node.id, node]))
    setNodes((current) => current.map((node) => {
      const next = byId.get(node.id)
      if (!next) return node
      return {
        ...node,
        position: { x: next.x, y: next.y },
        style: { ...node.style, width: next.width, height: next.height },
        data: {
          ...node.data,
          raw: { ...next },
        },
      }
    }))
    setAlignmentGuides([])
    setNotice('Database layout applied.')
    markDirty()
    window.setTimeout(() => {
      void fitView({ padding: 0.2, maxZoom: 1.2, duration: 300 })
    }, 0)
  }, [edges, fitView, markDirty, nodes, setAlignmentGuides, setNodes, setNotice])

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
    setNodes(() => nextNodes)
    setAlignmentGuides([])
    setNotice(fitted > 0 ? `Auto-fitted ${fitted} cards.` : 'All cards already fit their content.')
    markDirty()
  }, [flowRef, markDirty, nodes, setAlignmentGuides, setNodes, setNotice])

  return {
    replanLayout,
    applyLayoutPreview,
    cancelLayoutPreview,
    layoutPreview: activePreview,
    autoLayoutApi,
    autoLayoutDatabase,
    autoFitAll,
  }
}
