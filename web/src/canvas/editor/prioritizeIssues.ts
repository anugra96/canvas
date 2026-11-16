import type { CanvasProfileIssue } from '@canvas/contract'

import type { CanvasFlowEdge, CanvasFlowNode } from '../model/adapter'

export interface PrioritizedValidationIssue {
  issue: CanvasProfileIssue
  connections: number
  score: number
}

const TYPE_WEIGHT: Record<string, number> = {
  system: 6,
  api: 6,
  database: 6,
  schema: 6,
  repository: 4,
  process: 4,
  artifact: 4,
  actor: 2,
  note: 1,
  decision: 1,
  risk: 1,
}

const CODE_WEIGHT: Record<CanvasProfileIssue['code'], number> = {
  schema_invalid: 90,
  example_invalid: 85,
  schema_contract: 80,
  missing_required_field: 70,
  relation_not_allowed: 60,
  unknown_relation_type: 55,
  schema_review: 50,
  missing_relation_type: 45,
  group_endpoint: 40,
  schema_unlinked: 35,
  artifact_without_producer: 39,
  process_without_runner: 38,
  unknown_entity_type: 30,
  missing_endpoint: 25,
  untyped_text: 20,
}

function nodeType(node: CanvasFlowNode | undefined): string {
  return node?.data.entity?.entityType ?? ''
}

export function prioritizeValidationIssues(
  issues: CanvasProfileIssue[],
  nodes: CanvasFlowNode[],
  edges: CanvasFlowEdge[],
): PrioritizedValidationIssue[] {
  const degree = new Map<string, number>()
  const edgesById = new Map(edges.map((edge) => [edge.id, edge]))
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  for (const edge of edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1)
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1)
  }

  return issues
    .map((issue) => {
      const edge = issue.edgeId ? edgesById.get(issue.edgeId) : undefined
      const node = issue.nodeId ? nodesById.get(issue.nodeId) : undefined
      const connections = edge
        ? (degree.get(edge.source) ?? 0) + (degree.get(edge.target) ?? 0)
        : issue.nodeId
          ? degree.get(issue.nodeId) ?? 0
          : 0
      const typeWeight = Math.max(
        nodeType(node) ? TYPE_WEIGHT[nodeType(node)] ?? 1 : 0,
        edge
          ? Math.max(
            TYPE_WEIGHT[nodeType(nodesById.get(edge.source))] ?? 1,
            TYPE_WEIGHT[nodeType(nodesById.get(edge.target))] ?? 1,
          )
          : 0,
      )
      const severityWeight = issue.severity === 'error' ? 100_000 : 0
      const score = severityWeight + connections * 1_000 + typeWeight * 100 + (CODE_WEIGHT[issue.code] ?? 0)
      return { issue, connections, score }
    })
    .sort((left, right) => (
      right.score - left.score
      || left.issue.message.localeCompare(right.issue.message)
    ))
}
