import type { CanvasNode, JsonCanvas } from '../jsonCanvas'
import { getEdgeMeta, getEntityMeta } from '../ontology'
import type { CanvasProfileIssue } from '../profile'

export function normalizeEndpoint(value: string): string {
  const trimmed = value.trim()
  const split = trimmed.indexOf(' ')
  if (split < 0) return trimmed
  return `${trimmed.slice(0, split).toUpperCase()} ${trimmed.slice(split + 1).trim()}`
}

function endpointParts(value: string): { method: string; path: string } {
  const normalized = normalizeEndpoint(value)
  const split = normalized.indexOf(' ')
  return split < 0
    ? { method: normalized, path: '' }
    : { method: normalized.slice(0, split), path: normalized.slice(split + 1) }
}

export function canvasEndpoints(canvas: Pick<JsonCanvas, 'nodes'>): string[] {
  const endpoints = new Set<string>()
  for (const node of canvas.nodes ?? []) {
    const entity = getEntityMeta(node)
    if (entity?.entityType !== 'endpoint') continue
    const method = String(entity.fields.method ?? '').trim().toUpperCase()
    const path = String(entity.fields.path ?? '').trim()
    if (!path) continue
    endpoints.add(`${method} ${path}`.trim())
  }
  return [...endpoints].sort((left, right) => {
    const a = endpointParts(left)
    const b = endpointParts(right)
    return a.path.localeCompare(b.path) || a.method.localeCompare(b.method)
  })
}

export function validateEndpointLinks(
  canvas: Pick<JsonCanvas, 'nodes' | 'edges'>,
  endpointLists: ReadonlyMap<string, readonly string[]>,
): CanvasProfileIssue[] {
  const nodesById = new Map<string, CanvasNode>((canvas.nodes ?? []).map((node) => [node.id, node]))
  const issues: CanvasProfileIssue[] = []
  for (const edge of canvas.edges ?? []) {
    const stored = getEdgeMeta(edge)?.endpoint?.trim()
    if (!stored) continue
    const target = nodesById.get(edge.toNode)
    const entity = target ? getEntityMeta(target) : undefined
    if (!target || entity?.entityType !== 'system' || String(entity.fields.kind ?? '') !== 'api') continue
    const endpoints = endpointLists.get(target.id)
    if (!endpoints) continue
    const normalized = normalizeEndpoint(stored)
    if (endpoints.some((endpoint) => normalizeEndpoint(endpoint) === normalized)) continue
    issues.push({
      code: 'endpoint_stale',
      severity: 'warning',
      message: `Endpoint "${stored}" no longer exists in the linked API canvas.`,
      edgeId: edge.id,
    })
  }
  return issues
}
