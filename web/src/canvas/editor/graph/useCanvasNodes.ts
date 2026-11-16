import { applyNodeChanges, useReactFlow, type NodeChange } from '@xyflow/react'
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  findEntityType,
  renderEntityMarkdown,
  type EntityFields,
  type Ontology,
} from '@canvas/contract'

import type { AlignmentGuide } from '../../model/alignment'
import { nodeDimensions, type CanvasFlowNode } from '../../model/adapter'
import { findBestCardSize } from '../autoFit'
import { growResourceLanes } from './growLanes'
import { moveGroupMembers } from './moveGroupMembers'
import { snapPositionChanges } from './snapPositionChanges'

interface UseCanvasNodesInput {
  nodes: CanvasFlowNode[]
  setNodes: (update: (current: CanvasFlowNode[]) => CanvasFlowNode[]) => void
  markDirty: () => void
  ontology: Ontology
  flowRef: React.RefObject<HTMLDivElement | null>
}

export function useCanvasNodes({
  nodes,
  setNodes,
  markDirty,
  ontology,
  flowRef,
}: UseCanvasNodesInput) {
  const { getZoom } = useReactFlow()
  const nodesRef = useRef(nodes)
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuide[]>([])

  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])

  const updateText = useCallback((id: string, text: string) => {
    setNodes((current) => current.map((node) => node.id === id
      ? { ...node, data: { ...node.data, text, raw: { ...node.data.raw, text } } }
      : node))
    markDirty()
  }, [markDirty, setNodes])

  const updateLabel = useCallback((id: string, label: string) => {
    setNodes((current) => current.map((node) => node.id === id
      ? { ...node, data: { ...node.data, label, raw: { ...node.data.raw, label } } }
      : node))
    markDirty()
  }, [markDirty, setNodes])

  const updateEntityField = useCallback((id: string, fieldKey: string, value: string) => {
    setNodes((current) => current.map((node) => {
      if (node.id !== id || !node.data.entity) return node
      const entityType = findEntityType(ontology, node.data.entity.entityType)
      if (!entityType) return node
      const fields: EntityFields = { ...node.data.entity.fields, [fieldKey]: value }
      const text = renderEntityMarkdown(entityType, fields)
      const entity = { ...node.data.entity, fields }
      return {
        ...node,
        data: {
          ...node.data,
          entity,
          text,
          raw: { ...node.data.raw, app: entity, text },
        },
      }
    }))
    markDirty()
  }, [markDirty, ontology, setNodes])

  const resizeNode = useCallback((id: string, width: number, height: number) => {
    setNodes((current) => current.map((node) => node.id === id
      ? {
        ...node,
        style: { ...node.style, width, height },
        data: { ...node.data, raw: { ...node.data.raw, width, height } },
      }
      : node))
    markDirty()
  }, [markDirty, setNodes])

  const autoFitNode = useCallback((id: string) => {
    const flowNode = nodes.find((node) => node.id === id)
    if (!flowNode || flowNode.type === 'group') return
    const wrapper = flowRef.current?.querySelector<HTMLElement>(`.react-flow__node[data-id="${id}"]`)
    const card = wrapper?.querySelector<HTMLElement>('.canvas-node')
    if (!card) return
    const size = nodeDimensions(flowNode)
    const next = findBestCardSize(card, size.width, size.height)
    resizeNode(id, next.width, next.height)
  }, [flowRef, nodes, resizeNode])

  const onNodesChange = useCallback((changes: NodeChange<CanvasFlowNode>[]) => {
    const snapped = snapPositionChanges(changes, nodesRef.current, getZoom())
    setAlignmentGuides(snapped.guides)
    setNodes((current) => {
      const next = applyNodeChanges(snapped.changes, current)
      const positionChanges = snapped.changes
        .filter((change): change is Extract<NodeChange<CanvasFlowNode>, { type: 'position' }> =>
          change.type === 'position' && Boolean(change.position))
        .map((change) => ({ id: change.id, position: change.position! }))
      return growResourceLanes(moveGroupMembers(current, next, positionChanges))
    })
    const material = changes.some((change) =>
      change.type === 'remove'
      || change.type === 'add'
      || change.type === 'replace'
      || (change.type === 'position' && change.dragging === false)
      || (change.type === 'dimensions' && change.resizing === false))
    if (material) markDirty()
  }, [getZoom, markDirty, setNodes])

  return {
    updateText,
    updateLabel,
    updateEntityField,
    resizeNode,
    autoFitNode,
    onNodesChange,
    alignmentGuides,
    setAlignmentGuides,
  }
}
