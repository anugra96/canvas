import {
  getEdgeMeta,
  getEntityMeta,
  type CanvasEdge,
  type CanvasNode,
  type CanvasProfileIssue,
} from '@canvas/contract'

function entityType(node: CanvasNode): string {
  return getEntityMeta(node)?.entityType ?? ''
}

function fieldText(node: CanvasNode, key: string): string {
  const value = getEntityMeta(node)?.fields[key]
  return value == null ? '' : String(value).trim()
}

function nodeName(node: CanvasNode): string {
  return fieldText(node, 'name') || fieldText(node, 'title') || `Untitled ${entityType(node) || 'card'}`
}

function incomingRelations(edges: CanvasEdge[]): Map<string, Set<string>> {
  const incoming = new Map<string, Set<string>>()
  for (const edge of edges) {
    const relation = getEdgeMeta(edge)?.relationType
    if (!relation) continue
    const relations = incoming.get(edge.toNode) ?? new Set<string>()
    relations.add(relation)
    incoming.set(edge.toNode, relations)
  }
  return incoming
}

export function validateSemanticRules(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
): CanvasProfileIssue[] {
  const issues: CanvasProfileIssue[] = []
  const incoming = incomingRelations(edges)

  for (const node of nodes) {
    const type = entityType(node)
    const relations = incoming.get(node.id) ?? new Set<string>()
    const name = nodeName(node)

    if (type === 'artifact' && !relations.has('produces')) {
      issues.push({
        code: 'artifact_without_producer',
        severity: 'warning',
        message: `Artifact "${name}" has no producer.`,
        nodeId: node.id,
      })
    }

    if (type === 'process' && !relations.has('runs')) {
      issues.push({
        code: 'process_without_runner',
        severity: 'warning',
        message: `Process "${name}" is not run by an Actor or System.`,
        nodeId: node.id,
      })
    }

  }

  return issues
}
