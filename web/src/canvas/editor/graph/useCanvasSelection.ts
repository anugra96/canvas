import { useCallback, useState } from 'react'

import { createNodeId, getDistrict, getGroupMembers } from '@canvas/contract'
import type { CanvasNode, DatabaseTarget, Ontology } from '@canvas/contract'

import { convertNodeType } from '../../model/cardTypes'
import { applyColorToFlowEdge } from '../../model/edgeRelations'
import { nodeDimensions, toFlowNode, type CanvasFlowEdge, type CanvasFlowNode } from '../../model/adapter'
import { insertNodes } from '../../model/insertNodes'
import { duplicateSelection } from './duplicate'

interface UseCanvasSelectionInput {
  nodes: CanvasFlowNode[]
  edges: CanvasFlowEdge[]
  setNodes: (update: (current: CanvasFlowNode[]) => CanvasFlowNode[]) => void
  setEdges: (update: (current: CanvasFlowEdge[]) => CanvasFlowEdge[]) => void
  markDirty: () => void
  ontology: Ontology
  canUndo: boolean
  canRedo: boolean
  databaseTarget?: DatabaseTarget
  onRestoreDatabaseTarget?: (target: DatabaseTarget | undefined) => void
  undoHistory: (snapshot: { nodes: CanvasFlowNode[]; edges: CanvasFlowEdge[]; databaseTarget?: DatabaseTarget }) => { nodes: CanvasFlowNode[]; edges: CanvasFlowEdge[]; databaseTarget?: DatabaseTarget } | null
  redoHistory: (snapshot: { nodes: CanvasFlowNode[]; edges: CanvasFlowEdge[]; databaseTarget?: DatabaseTarget }) => { nodes: CanvasFlowNode[]; edges: CanvasFlowEdge[]; databaseTarget?: DatabaseTarget } | null
}

export function useCanvasSelection({
  nodes,
  edges,
  setNodes,
  setEdges,
  markDirty,
  ontology,
  canUndo,
  canRedo,
  databaseTarget,
  onRestoreDatabaseTarget,
  undoHistory,
  redoHistory,
}: UseCanvasSelectionInput) {
  const [sizeDialogOpen, setSizeDialogOpen] = useState(false)

  const groupSelected = useCallback(() => {
    const selected = nodes.filter((node) => node.selected && node.type !== 'group')
    if (selected.length === 0) return
    const bounds = selected.map((node) => {
      const size = nodeDimensions(node)
      return {
        left: node.position.x,
        top: node.position.y,
        right: node.position.x + size.width,
        bottom: node.position.y + size.height,
      }
    })
    const left = Math.min(...bounds.map((boundsItem) => boundsItem.left)) - 40
    const top = Math.min(...bounds.map((boundsItem) => boundsItem.top)) - 44
    const right = Math.max(...bounds.map((boundsItem) => boundsItem.right)) + 40
    const bottom = Math.max(...bounds.map((boundsItem) => boundsItem.bottom)) + 40
    const groupRaw = {
      id: createNodeId(),
      type: 'group',
      x: Math.round(left),
      y: Math.round(top),
      width: Math.round(right - left),
      height: Math.round(bottom - top),
      label: 'Group',
      app: { groupMembers: selected.map((node) => node.id) },
    } as CanvasNode
    setNodes((current) => insertNodes(
      current,
      [{ ...toFlowNode(groupRaw), selected: true }],
      'start',
    ))
    setEdges((current) => current.map((edge) => ({ ...edge, selected: false })))
    markDirty()
  }, [markDirty, nodes, setEdges, setNodes])

  const deleteSelected = useCallback(() => {
    const selectedNodeIds = new Set(nodes.filter((node) => node.selected).map((node) => node.id))
    const selectedEdgeIds = new Set(edges.filter((edge) => edge.selected).map((edge) => edge.id))
    if (selectedNodeIds.size === 0 && selectedEdgeIds.size === 0) return
    setNodes((current) => current.filter((node) => !selectedNodeIds.has(node.id)))
    setEdges((current) => current.filter((edge) =>
      !selectedEdgeIds.has(edge.id)
      && !selectedNodeIds.has(edge.source)
      && !selectedNodeIds.has(edge.target)))
    markDirty()
  }, [edges, markDirty, nodes, setEdges, setNodes])

  const applyColor = useCallback((color: string | undefined) => {
    setNodes((current) => current.map((node) => {
      if (!node.selected) return node
      const raw = { ...node.data.raw }
      if (color) raw.color = color
      else delete raw.color
      const style = { ...node.style }
      delete style.borderColor
      delete style.background
      return {
        ...node,
        data: { ...node.data, raw },
        style,
      }
    }))
    setEdges((current) => current.map((edge) =>
      edge.selected ? applyColorToFlowEdge(edge, color) : edge))
    markDirty()
  }, [markDirty, setEdges, setNodes])

  const undo = useCallback(() => {
    const snapshot = undoHistory({ nodes, edges, databaseTarget })
    if (!snapshot) return
    setNodes(() => snapshot.nodes)
    setEdges(() => snapshot.edges)
    onRestoreDatabaseTarget?.(snapshot.databaseTarget)
    markDirty()
  }, [databaseTarget, edges, markDirty, nodes, onRestoreDatabaseTarget, setEdges, setNodes, undoHistory])

  const redo = useCallback(() => {
    const snapshot = redoHistory({ nodes, edges, databaseTarget })
    if (!snapshot) return
    setNodes(() => snapshot.nodes)
    setEdges(() => snapshot.edges)
    onRestoreDatabaseTarget?.(snapshot.databaseTarget)
    markDirty()
  }, [databaseTarget, edges, markDirty, nodes, onRestoreDatabaseTarget, redoHistory, setEdges, setNodes])

  const selectAll = useCallback(() => {
    setNodes((current) => current.map((node) => ({
      ...node,
      selected: node.data.entity?.entityType !== 'database_definition',
    })))
    setEdges((current) => current.map((edge) => ({ ...edge, selected: true })))
  }, [setEdges, setNodes])

  const clearSelection = useCallback(() => {
    setNodes((current) => current.map((node) => ({ ...node, selected: false })))
    setEdges((current) => current.map((edge) => ({ ...edge, selected: false })))
    setSizeDialogOpen(false)
  }, [setEdges, setNodes])

  const duplicate = useCallback(() => {
    const clones = duplicateSelection({
      nodes,
      edges,
      createId: createNodeId,
    })
    if (clones.nodes.length === 0) return
    setNodes((current) => insertNodes(current, clones.nodes))
    setEdges((current) => [
      ...current.map((edge) => ({ ...edge, selected: false })),
      ...clones.edges,
    ])
    markDirty()
  }, [edges, markDirty, nodes, setEdges, setNodes])

  const nudgeSelection = useCallback((dx: number, dy: number) => {
    const selected = nodes.filter((node) => node.selected)
    if (selected.length === 0) return
    const moving = new Set(selected.map((node) => node.id))

    for (const group of nodes) {
      if (!group.selected || group.type !== 'group') continue
      const members = getGroupMembers(group.data.raw)
      if (members) {
        for (const memberId of members) moving.add(memberId)
        continue
      }
      const groupSize = nodeDimensions(group)
      for (const node of nodes) {
        if (node.id === group.id || node.type === 'group') continue
        const size = nodeDimensions(node)
        const inside = node.position.x >= group.position.x
          && node.position.y >= group.position.y
          && node.position.x + size.width <= group.position.x + groupSize.width
          && node.position.y + size.height <= group.position.y + groupSize.height
        if (inside) moving.add(node.id)
      }
    }

    setNodes((current) => current.map((node) => {
      if (!moving.has(node.id)) return node
      const x = node.position.x + dx
      const y = node.position.y + dy
      return {
        ...node,
        position: { x, y },
        data: { ...node.data, raw: { ...node.data.raw, x, y } },
      }
    }))
    markDirty()
  }, [markDirty, nodes, setNodes])

  const selectedNodes = nodes.filter((node) => node.selected)
  const selectedEdges = edges.filter((edge) => edge.selected)
  const selectedRelationTypes = new Set(selectedEdges.map((edge) => edge.data?.relationType ?? ''))
  const selectedRelationValue = selectedRelationTypes.size === 0
    ? ''
    : selectedRelationTypes.size === 1
      ? [...selectedRelationTypes][0]
      : 'mixed'
  const singleSelectedNode = selectedNodes.length === 1 ? selectedNodes[0] : undefined
  const singleSelectedGroup = singleSelectedNode?.type === 'group' ? singleSelectedNode : undefined
  const singleSelectedGroupId = singleSelectedGroup?.id
  // A group with an owner is a team boundary (stored as app.district); "district" stays out of the UI.
  const singleSelectedGroupOwnerId = singleSelectedGroup ? getDistrict(singleSelectedGroup.data.raw)?.ownerId : undefined
  const districtOwners = nodes
    .filter((node) => node.data.entity?.entityType === 'actor')
    .map((node) => ({
      id: node.id,
      name: String(node.data.entity?.fields.name ?? '').trim() || 'Untitled Actor',
    }))
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
  const cardTypeValue = singleSelectedNode && singleSelectedNode.type !== 'group'
    ? singleSelectedNode.data.entity?.entityType ?? 'text'
    : undefined

  // Choosing an owner makes the group a boundary; "No owner" makes it a plain group again.
  function setSelectedGroupOwner(ownerId: string | undefined) {
    if (!singleSelectedGroupId) return
    setNodes((current) => current.map((node) => {
      if (node.id !== singleSelectedGroupId || node.type !== 'group') return node
      const app = { ...(node.data.raw.app ?? {}) }
      if (ownerId) app.district = { ...(getDistrict(node.data.raw) ?? {}), ownerId }
      else delete app.district
      return { ...node, data: { ...node.data, raw: { ...node.data.raw, app } } }
    }))
    markDirty()
  }

  function changeCardType(typeId: string) {
    if (!singleSelectedNode) return
    setNodes((current) => current.map((node) =>
      node.id === singleSelectedNode.id ? convertNodeType(node, typeId, ontology) : node))
    markDirty()
  }

  const selectedGroups = selectedNodes.filter((node) => node.type === 'group')
  const selectedCards = selectedNodes.filter((node) => node.type !== 'group')
  const membershipGroup = selectedGroups.length === 1 ? selectedGroups[0] : undefined
  const membershipIds = membershipGroup
    ? getGroupMembers(membershipGroup.data.raw) ?? []
    : []
  const allSelectedCardsAreMembers = selectedCards.length > 0
    && selectedCards.every((card) => membershipIds.includes(card.id))
  const canManageMembership = Boolean(membershipGroup && selectedCards.length > 0)

  function toggleGroupMembership() {
    if (!membershipGroup || selectedCards.length === 0) return
    const currentMembers = getGroupMembers(membershipGroup.data.raw) ?? []
    const selectedIds = new Set(selectedCards.map((card) => card.id))
    const allMembers = selectedCards.every((card) => currentMembers.includes(card.id))
    const nextMembers = allMembers
      ? currentMembers.filter((id) => !selectedIds.has(id))
      : [...new Set([...currentMembers, ...selectedCards.map((card) => card.id)])]
    setNodes((current) => current.map((node) => {
      if (node.id !== membershipGroup.id) return node
      const raw = {
        ...node.data.raw,
        app: { ...(node.data.raw.app ?? {}), groupMembers: nextMembers },
      } as CanvasNode
      return { ...node, data: { ...node.data, raw } }
    }))
    markDirty()
  }

  return {
    canUndo,
    canRedo,
    undo,
    redo,
    selectAll,
    clearSelection,
    deleteSelected,
    duplicateSelection: duplicate,
    nudgeSelection,
    groupSelected,
    applyColor,
    sizeDialogOpen,
    setSizeDialogOpen,
    selectedNodes,
    selectedEdges,
    selectedRelationValue,
    singleSelectedNode,
    singleSelectedGroup,
    singleSelectedGroupOwnerId,
    groupOwners: districtOwners,
    cardTypeValue,
    canManageMembership,
    allSelectedCardsAreMembers,
    changeCardType,
    toggleGroupMembership,
    setSelectedGroupOwner,
  }
}

