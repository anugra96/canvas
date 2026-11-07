import { useMemo } from 'react'

import {
  validateProfileCanvas,
  type CanvasProfile,
  type JsonCanvas,
  type Ontology,
} from '@canvas/contract'

import { fromFlowCanvas, type CanvasFlowEdge, type CanvasFlowNode } from '../model/adapter'

export function useProfileValidation({
  nodes,
  edges,
  baseCanvas,
  profile,
  ontology,
  isSystems,
}: {
  nodes: CanvasFlowNode[]
  edges: CanvasFlowEdge[]
  baseCanvas: JsonCanvas
  profile: CanvasProfile
  ontology: Ontology
  isSystems: boolean
}) {
  return useMemo(() => {
    if (!isSystems) return []
    return validateProfileCanvas(fromFlowCanvas(nodes, edges, baseCanvas), profile, ontology)
  }, [baseCanvas, edges, isSystems, nodes, ontology, profile])
}
