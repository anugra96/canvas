import { useReactFlow } from '@xyflow/react'
import { useCallback, useState, type MouseEvent } from 'react'

import { findEntityType, type Ontology } from '@canvas/contract'

import { toFlowNode, type CanvasFlowNode } from '../../model/adapter'
import { insertNodes } from '../../model/insertNodes'
import type { CardMenuState } from './types'
import { makeEntityNode, makeTextNode } from './nodes'
import { findPlacementPosition, type Placement } from './placement'

interface UseCanvasPlacementInput {
  nodes: CanvasFlowNode[]
  setNodes: (update: (current: CanvasFlowNode[]) => CanvasFlowNode[]) => void
  markDirty: () => void
  ontology: Ontology
  isSystems: boolean
  flowRef: React.RefObject<HTMLDivElement | null>
  clientToFlow: (clientX: number, clientY: number) => { x: number; y: number }
}

export function useCanvasPlacement({
  nodes,
  setNodes,
  markDirty,
  ontology,
  isSystems,
  flowRef,
  clientToFlow,
}: UseCanvasPlacementInput) {
  const { fitView } = useReactFlow()
  const [cardMenu, setCardMenu] = useState<CardMenuState | null>(null)

  const addCard = useCallback((position = { x: 120, y: 120 }) => {
    const raw = makeTextNode(position)
    setNodes((current) => insertNodes(current, [{ ...toFlowNode(raw), selected: true }]))
    markDirty()
  }, [markDirty, setNodes])

  const addEntity = useCallback((entityTypeId: string, position = { x: 120, y: 120 }) => {
    const raw = makeEntityNode(entityTypeId, position, ontology)
    if (!raw) return
    setNodes((current) => insertNodes(current, [{ ...toFlowNode(raw), selected: true }]))
    markDirty()
  }, [markDirty, ontology, setNodes])

  const handleDoubleClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (!target.classList.contains('react-flow__pane')) return
    const bounds = flowRef.current?.getBoundingClientRect()
    if (!bounds) return
    setCardMenu({
      screen: { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
    })
  }, [flowRef])

  const insertCardFromMenu = useCallback((templateId: string) => {
    const menu = cardMenu
    if (!menu) return
    if (isSystems && templateId === 'text') return
    const entityType = templateId === 'text' ? undefined : findEntityType(ontology, templateId)
    const width = templateId === 'text' ? 360 : entityType?.defaultSize.width
    const height = templateId === 'text' ? 200 : entityType?.defaultSize.height
    if (!width || !height) return
    const bounds = flowRef.current?.getBoundingClientRect()
    if (!bounds) return
    const position = clientToFlow(menu.screen.x + bounds.left, menu.screen.y + bounds.top)
    const topLeft = {
      x: position.x - width / 2,
      y: position.y - height / 2,
    }
    const raw = templateId === 'text'
      ? makeTextNode(topLeft, width, height)
      : makeEntityNode(templateId, topLeft, ontology)
    if (!raw) return
    setCardMenu(null)
    setNodes((current) => insertNodes(current, [{ ...toFlowNode(raw), selected: true }]))
    markDirty()
  }, [cardMenu, clientToFlow, flowRef, isSystems, markDirty, ontology, setNodes])

  const centerPosition = useCallback((width = 360, height = 200): { x: number; y: number } => {
    const bounds = flowRef.current?.getBoundingClientRect()
    const position = clientToFlow(
      (bounds?.left ?? 0) + (bounds?.width ?? window.innerWidth) / 2,
      (bounds?.top ?? 0) + (bounds?.height ?? window.innerHeight) / 2,
    )
    return { x: position.x - width / 2, y: position.y - height / 2 }
  }, [clientToFlow, flowRef])

  const placementPosition = useCallback((width: number, height: number): Placement => {
    const bounds = flowRef.current?.getBoundingClientRect()
    return findPlacementPosition({
      base: centerPosition(width, height),
      width,
      height,
      nodes,
      bounds: bounds
        ? {
          topLeft: clientToFlow(bounds.left, bounds.top),
          bottomRight: clientToFlow(bounds.right, bounds.bottom),
        }
        : undefined,
    })
  }, [centerPosition, clientToFlow, flowRef, nodes])

  const revealPlacement = useCallback((visible: boolean) => {
    if (visible) return
    window.setTimeout(() => {
      void fitView({ padding: 0.25, maxZoom: 1 })
    }, 60)
  }, [fitView])

  const addAtCenter = useCallback(() => {
    addCard(centerPosition(360, 200))
  }, [addCard, centerPosition])

  const addNoteAtCenter = useCallback(() => {
    const noteType = findEntityType(ontology, 'note')
    if (!noteType) return
    const placement = placementPosition(noteType.defaultSize.width, noteType.defaultSize.height)
    addEntity('note', placement)
    revealPlacement(placement.visible)
  }, [addEntity, ontology, placementPosition, revealPlacement])

  const addEntityAtCenter = useCallback((entityTypeId: string) => {
    const entityType = findEntityType(ontology, entityTypeId)
    if (!entityType) return
    if (!isSystems) {
      addEntity(entityTypeId, centerPosition(entityType.defaultSize.width, entityType.defaultSize.height))
      return
    }
    const placement = placementPosition(entityType.defaultSize.width, entityType.defaultSize.height)
    addEntity(entityTypeId, placement)
    revealPlacement(placement.visible)
  }, [addEntity, centerPosition, isSystems, ontology, placementPosition, revealPlacement])

  return {
    cardMenu,
    setCardMenu,
    addCard,
    addEntity,
    handleDoubleClick,
    insertCardFromMenu,
    placementPosition,
    revealPlacement,
    addAtCenter,
    addNoteAtCenter,
    addEntityAtCenter,
  }
}
