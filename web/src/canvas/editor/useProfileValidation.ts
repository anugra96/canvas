import { useMemo } from 'react'

import {
  validateProfileCanvas,
  type CanvasProfile,
  type JsonCanvas,
  type Ontology,
} from '@canvas/contract'

import { fromFlowCanvas, type CanvasFlowEdge, type CanvasFlowNode } from '../model/adapter'
import { validateSchemaContracts } from '../schema/jsonSchema'
import { validateSemanticRules } from '../semantics/semanticRules'

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
    const canvas = fromFlowCanvas(nodes, edges, baseCanvas)
    return [
      ...validateProfileCanvas(canvas, profile, ontology),
      ...validateSchemaContracts(canvas.nodes ?? [], canvas.edges ?? []),
      ...validateSemanticRules(canvas.nodes ?? [], canvas.edges ?? []),
    ]
  }, [baseCanvas, edges, isSystems, nodes, ontology, profile])
}
