import { useMemo } from 'react'

import {
  levelReadiness,
  levelReadinessIssues,
  validateApiDesign,
  validateProfileCanvas,
  type CanvasProfile,
  type JsonCanvas,
  type Ontology,
} from '@canvas/contract'

import { fromFlowCanvas, type CanvasFlowEdge, type CanvasFlowNode } from '../model/adapter'
import { validateApiExamples, validateApiOperations, validateSchemaContracts } from '../schema/jsonSchema'
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
    if (!isSystems) return { issues: [], levelReadiness: [] }
    const canvas = fromFlowCanvas(nodes, edges, baseCanvas)
    const readiness = isApi ? [] : levelReadiness(canvas.nodes ?? [], canvas.edges ?? [])
    return {
      issues: [
        ...validateProfileCanvas(canvas, profile, ontology),
        ...validateSchemaContracts(canvas.nodes ?? [], canvas.edges ?? [], new Date(), isApi ? 'api' : 'systems'),
        ...(isApi ? validateApiExamples(canvas.nodes ?? []) : []),
        ...(isApi ? validateApiOperations(canvas.nodes ?? []) : []),
        ...(isApi ? validateApiDesign(canvas) : []),
        ...validateSemanticRules(canvas.nodes ?? [], canvas.edges ?? []),
        ...levelReadinessIssues(readiness),
      ],
      levelReadiness: readiness,
    }
  }, [baseCanvas, edges, isApi, isSystems, nodes, ontology, profile])
}
