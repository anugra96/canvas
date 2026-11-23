import { districtOf, isDistrict } from './districts'
import type { CanvasEdge, CanvasNode, JsonCanvas } from './jsonCanvas'
import { getDistrict, getEdgeMeta, getEntityMeta } from './ontology'
import type { CanvasProfileIssue, ProfileIssueCode } from './profile'

export const ZONING_ISSUE_CODES: readonly ProfileIssueCode[] = [
  'unzoned_card',
  'district_without_owner',
  'shared_landmark',
  'route_bypasses_gate',
]

const GATE_KINDS = new Set(['api', 'queue'])
const EXTERNAL_KIND = 'external'

function entityType(node: CanvasNode | undefined): string {
  return node ? getEntityMeta(node)?.entityType ?? '' : ''
}

function kindOf(node: CanvasNode | undefined): string {
  const kind = node ? getEntityMeta(node)?.fields.kind : undefined
  return kind == null ? '' : String(kind)
}

function nodeName(node: CanvasNode): string {
  const fields = getEntityMeta(node)?.fields ?? {}
  const name = fields.name ?? fields.title
  const trimmed = name == null ? '' : String(name).trim()
  if (trimmed) return trimmed
  if (node.type === 'group' && node.label?.trim()) return node.label.trim()
  return node.id
}

function districtLabel(nodeById: Map<string, CanvasNode>, districtId: string): string {
  const node = nodeById.get(districtId)
  return node ? nodeName(node) : districtId
}

function relationOf(edge: CanvasEdge): string | undefined {
  return getEdgeMeta(edge)?.relationType
}

function sortById<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => left.id.localeCompare(right.id))
}

export function hasDistricts(canvas: Pick<JsonCanvas, 'nodes'>): boolean {
  return (canvas.nodes ?? []).some((node) => isDistrict(node))
}

export function validateZoning(canvas: Pick<JsonCanvas, 'nodes' | 'edges'>): CanvasProfileIssue[] {
  const nodes = canvas.nodes ?? []
  if (!nodes.some((node) => isDistrict(node))) return []
  const edges = canvas.edges ?? []
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const districts = districtOf(canvas as JsonCanvas)
  const issues: CanvasProfileIssue[] = []

  for (const node of sortById(nodes)) {
    if (entityType(node) !== 'system' || kindOf(node) === EXTERNAL_KIND) continue
    if (districts.has(node.id)) continue
    issues.push({
      code: 'unzoned_card',
      severity: 'warning',
      message: `System "${nodeName(node)}" is outside any group with an owner.`,
      nodeId: node.id,
    })
  }

  for (const node of sortById(nodes)) {
    if (!isDistrict(node)) continue
    const ownerId = getDistrict(node)?.ownerId?.trim()
    const owner = ownerId ? nodeById.get(ownerId) : undefined
    if (owner && entityType(owner) === 'actor') continue
    const label = nodeName(node)
    issues.push({
      code: 'district_without_owner',
      severity: 'warning',
      message: ownerId
        ? `Group "${label}" is owned by "${owner ? nodeName(owner) : ownerId}", which is not an Actor card on this canvas.`
        : `Group "${label}" has no owner.`,
      nodeId: node.id,
    })
  }

  const databaseDistricts = new Map<string, Set<string>>()
  const databaseSources = new Map<string, Set<string>>()
  for (const edge of sortById(edges)) {
    if (relationOf(edge) !== 'uses') continue
    const target = nodeById.get(edge.toNode)
    if (!target || entityType(target) !== 'system' || kindOf(target) !== 'database') continue
    const source = nodeById.get(edge.fromNode)
    if (!source || entityType(source) !== 'system') continue
    const districtId = districts.get(source.id)
    if (!districtId) continue
    databaseDistricts.set(target.id, (databaseDistricts.get(target.id) ?? new Set()).add(districtId))
    databaseSources.set(target.id, (databaseSources.get(target.id) ?? new Set()).add(nodeName(source)))
  }
  for (const node of sortById(nodes)) {
    if (entityType(node) !== 'system' || kindOf(node) !== 'database') continue
    const usedFrom = databaseDistricts.get(node.id)
    if (!usedFrom || usedFrom.size < 2) continue
    const labels = [...usedFrom]
      .map((districtId) => districtLabel(nodeById, districtId))
      .sort((left, right) => left.localeCompare(right))
    const sources = [...(databaseSources.get(node.id) ?? [])].sort((left, right) => left.localeCompare(right))
    issues.push({
      code: 'shared_landmark',
      severity: 'warning',
      message: `Database "${nodeName(node)}" is used from groups ${labels.map((label) => `"${label}"`).join(' and ')}${sources.length > 0 ? ` by ${sources.map((name) => `"${name}"`).join(', ')}` : ''}.`,
      nodeId: node.id,
    })
  }

  for (const edge of sortById(edges)) {
    if (relationOf(edge) !== 'uses') continue
    const sourceDistrict = districts.get(edge.fromNode)
    const targetDistrict = districts.get(edge.toNode)
    if (!sourceDistrict || !targetDistrict || sourceDistrict === targetDistrict) continue
    const target = nodeById.get(edge.toNode)
    if (!target || entityType(target) !== 'system') continue
    const targetKind = kindOf(target)
    if (GATE_KINDS.has(targetKind) || targetKind === EXTERNAL_KIND) continue
    const source = nodeById.get(edge.fromNode)
    issues.push({
      code: 'route_bypasses_gate',
      severity: 'warning',
      message: `"${source ? nodeName(source) : edge.fromNode}" in "${districtLabel(nodeById, sourceDistrict)}" calls "${nodeName(target)}" in "${districtLabel(nodeById, targetDistrict)}" directly, not through its API or queue.`,
      edgeId: edge.id,
      nodeId: target.id,
    })
  }

  return issues
}
