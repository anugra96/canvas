import { useReactFlow } from '@xyflow/react'
import { useCallback } from 'react'

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

export function useCanvasLayout({
  nodes,
  edges,
  setNodes,
  setAlignmentGuides,
  markDirty,
  setNotice,
  flowRef,
}: UseCanvasLayoutInput) {
  const { fitView } = useReactFlow()

  const autoLayout = useCallback(() => {
    const sizes: Sizes = Object.fromEntries(nodes.map((node) => [node.id, nodeDimensions(node)]))
    const plan = planLayout(fromFlowCanvas(nodes, edges, {}), { kind: 'replan' }, sizes)
    const moves = new Map<string, LayoutMove>(plan.moves.map((move) => [move.id, move]))
    const resizes = new Map<string, GroupResize>(plan.groupResizes.map((resize) => [resize.id, resize]))
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
    setNotice(plan.moves.length === 0
      ? 'Layout is already tidy.'
      : `Layout applied: ${plan.moves.length} card${plan.moves.length === 1 ? '' : 's'} moved.`)
    window.setTimeout(() => {
      void fitView({ padding: 0.2, maxZoom: 1.2, duration: 300 })
    }, 0)
  }, [edges, fitView, markDirty, nodes, setAlignmentGuides, setNodes, setNotice])

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
    autoLayout,
    autoLayoutApi,
    autoLayoutDatabase,
    autoFitAll,
  }
}
