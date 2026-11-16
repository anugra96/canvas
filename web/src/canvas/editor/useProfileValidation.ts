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
  isApi,
}: {
  nodes: CanvasFlowNode[]
  edges: CanvasFlowEdge[]
  baseCanvas: JsonCanvas
  profile: CanvasProfile
  ontology: Ontology
  isSystems: boolean
  isApi: boolean
}) {
  return useMemo(() => {
    if (!isSystems) return []
    const canvas = fromFlowCanvas(nodes, edges, baseCanvas)
    return [
      ...validateProfileCanvas(canvas, profile, ontology),
      ...validateSchemaContracts(canvas.nodes ?? [], canvas.edges ?? [], new Date(), isApi ? 'api' : 'systems'),
      ...validateSemanticRules(canvas.nodes ?? [], canvas.edges ?? []),
    ]
  }, [baseCanvas, edges, isApi, isSystems, nodes, ontology, profile])
}
