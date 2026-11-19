import type { CanvasEdge, CanvasNode } from './jsonCanvas'
import { getEdgeMeta, getEntityMeta } from './ontology'
import type { CanvasProfileIssue } from './profile'

export const LEVEL_NUMBERS = [1, 2, 3, 4] as const

export type LevelNumber = (typeof LEVEL_NUMBERS)[number]

export interface LevelDefinition {
  level: LevelNumber
  name: string
}

export const LEVEL_DEFINITIONS: readonly LevelDefinition[] = [
  { level: 1, name: 'Context' },
  { level: 2, name: 'Containers' },
  { level: 3, name: 'Components' },
  { level: 4, name: 'Contracts' },
]

export const LEVEL_NAMES: Record<LevelNumber, string> = {
  1: 'Context',
  2: 'Containers',
  3: 'Components',
  4: 'Contracts',
}

export const ANNOTATION_ENTITY_TYPES = new Set(['note'])

export interface LevelGraph {
  levels: Map<string, LevelNumber>
  parents: Map<string, string>
  alsoParents: Map<string, string[]>
  children: Map<string, string[]>
}

export interface LevelSelection {
  visible: Set<string>
  folded: Map<string, string[]>
  unassigned: string[]
  ancestors: Map<string, string>
}

export interface LevelReadiness {
  level: LevelNumber
  name: string
  available: boolean
  ready: boolean
  unassigned: Array<{ id: string; name: string }>
}

function entityType(node: CanvasNode | undefined): string {
  return node ? getEntityMeta(node)?.entityType ?? '' : ''
}

function fieldsOf(node: CanvasNode | undefined): Record<string, unknown> {
  return (node ? getEntityMeta(node)?.fields : undefined) ?? {}
}

function field(node: CanvasNode | undefined, key: string): string {
  const value = fieldsOf(node)[key]
  return value == null ? '' : String(value)
}

export function levelCardName(node: CanvasNode): string {
  return field(node, 'name') || field(node, 'title') || node.id
}

function relationOf(edge: CanvasEdge): string | undefined {
  return getEdgeMeta(edge)?.relationType
}

function uniqueSorted(
  ids: string[],
  nodeById: Map<string, CanvasNode>,
): string[] {
  return [...new Set(ids)]
    .filter((id) => nodeById.has(id))
    .sort((left, right) => {
      const leftNode = nodeById.get(left)!
      const rightNode = nodeById.get(right)!
      return levelCardName(leftNode).localeCompare(levelCardName(rightNode))
        || left.localeCompare(right)
    })
}

function incoming(
  edges: CanvasEdge[],
  nodeId: string,
  relation: string,
  nodeById: Map<string, CanvasNode>,
  fromTypes: string[],
): string[] {
  return uniqueSorted(
    edges
      .filter((edge) => (
        edge.toNode === nodeId
        && edge.fromNode !== nodeId
        && relationOf(edge) === relation
        && fromTypes.includes(entityType(nodeById.get(edge.fromNode)))
      ))
      .map((edge) => edge.fromNode),
    nodeById,
  )
}

function incomingAny(
  edges: CanvasEdge[],
  nodeId: string,
  relations: readonly string[],
  nodeById: Map<string, CanvasNode>,
  fromTypes?: string[],
): string[] {
  return uniqueSorted(
    edges
      .filter((edge) => {
        const relation = relationOf(edge)
        return edge.toNode === nodeId
          && edge.fromNode !== nodeId
          && relation != null
          && relations.includes(relation)
          && (!fromTypes || fromTypes.includes(entityType(nodeById.get(edge.fromNode))))
      })
      .map((edge) => edge.fromNode),
    nodeById,
  )
}

function databaseUsers(
  nodeId: string,
  edges: CanvasEdge[],
  nodeById: Map<string, CanvasNode>,
): string[] {
  return incoming(edges, nodeId, 'uses', nodeById, ['system'])
}

function dataStoreSystems(
  nodeId: string,
  edges: CanvasEdge[],
  nodeById: Map<string, CanvasNode>,
): string[] {
  return incoming(edges, nodeId, 'uses', nodeById, ['system'])
}

function schemaRefArtifacts(
  schemaId: string,
  nodes: CanvasNode[],
): string[] {
  return nodes
    .filter((node) => (
      entityType(node) === 'artifact'
      && field(node, 'schemaRef') === schemaId
    ))
    .sort((left, right) => levelCardName(left).localeCompare(levelCardName(right)) || left.id.localeCompare(right.id))
    .map((node) => node.id)
}

function parentCandidates(
  node: CanvasNode,
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  nodeById: Map<string, CanvasNode>,
): string[] {
  const type = entityType(node)
  const kind = field(node, 'kind')
  if (type === 'system' && kind === 'job') {
    for (const types of [['system'], ['repository'], ['actor']]) {
      const matches = incoming(edges, node.id, 'uses', nodeById, types)
      if (matches.length > 0) return matches
    }
    return []
  }
  if (type === 'artifact') {
    for (const types of [['system'], ['repository']]) {
      const matches = incoming(edges, node.id, 'produces', nodeById, types)
      if (matches.length > 0) return matches
    }
    return []
  }
  if (type === 'repository') {
    return incoming(edges, node.id, 'uses', nodeById, ['system'])
  }
  if (type === 'schema') {
    const definers = incoming(edges, node.id, 'defines', nodeById, ['system', 'repository'])
    if (definers.length > 0) return definers
    if (kind === 'event') {
      const producers = incomingAny(edges, node.id, ['produces'], nodeById)
      if (producers.length > 0) return producers
    }
    const users = incoming(edges, node.id, 'uses', nodeById, ['system'])
    if (users.length === 1) return users
    const artifacts = schemaRefArtifacts(node.id, nodes)
    if (artifacts.length === 1) return artifacts
    const schemas = incoming(edges, node.id, 'uses', nodeById, ['schema'])
    if (schemas.length > 0) return schemas
    return []
  }
  if (type === 'system' && (kind === 'database' || kind === 'queue')) {
    const users = databaseUsers(node.id, edges, nodeById)
    return users.length === 1 ? users : []
  }
  return []
}

export function computeLevelGraph(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
): LevelGraph {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const levels = new Map<string, LevelNumber>()

  for (const node of nodes) {
    const type = entityType(node)
    const kind = field(node, 'kind')
    let level: LevelNumber | undefined
    if (type === 'actor') {
      level = 1
    } else if (type === 'system') {
      if (kind === 'job') {
        level = 2
      } else if (kind === 'database' || kind === 'queue') {
        level = dataStoreSystems(node.id, edges, nodeById).length === 1 ? 2 : 1
      } else {
        level = 1
      }
    } else if (type === 'repository' || type === 'artifact') {
      level = 2
    } else if (type === 'schema') {
      level = 4
    }
    if (level) levels.set(node.id, level)
  }

  const parents = new Map<string, string>()
  const alsoParents = new Map<string, string[]>()
  const children = new Map<string, string[]>()

  for (const node of nodes) {
    if (!levels.has(node.id)) continue
    const candidates = parentCandidates(node, nodes, edges, nodeById)
    const parent = candidates[0]
    if (!parent) continue
    parents.set(node.id, parent)
    if (candidates.length > 1) alsoParents.set(node.id, candidates.slice(1))
    children.set(parent, [...(children.get(parent) ?? []), node.id])
  }

  for (const [parent, childIds] of children) {
    children.set(parent, uniqueSorted(childIds, nodeById))
  }

  return { levels, parents, alsoParents, children }
}

export function selectVisibleCards(
  graph: LevelGraph,
  candidates: Set<string>,
  level: LevelNumber,
  expanded: ReadonlySet<string> = new Set(),
): LevelSelection {
  const visible = new Set<string>()
  for (const id of candidates) {
    const cardLevel = graph.levels.get(id)
    if (cardLevel != null && cardLevel <= level) visible.add(id)
  }

  let added = true
  while (added) {
    added = false
    for (const id of expanded) {
      if (!visible.has(id)) continue
      for (const childId of graph.children.get(id) ?? []) {
        if (!candidates.has(childId) || visible.has(childId)) continue
        if (!graph.levels.has(childId)) continue
        visible.add(childId)
        added = true
      }
    }
  }

  const folded = new Map<string, string[]>()
  const unassigned: string[] = []
  const ancestors = new Map<string, string>()

  for (const id of candidates) {
    if (visible.has(id) || !graph.levels.has(id)) continue
    const seen = new Set<string>([id])
    let current = graph.parents.get(id)
    let ancestor: string | undefined
    while (current && !seen.has(current)) {
      if (visible.has(current)) {
        ancestor = current
        break
      }
      seen.add(current)
      current = graph.parents.get(current)
    }
    if (ancestor) {
      ancestors.set(id, ancestor)
      folded.set(ancestor, [...(folded.get(ancestor) ?? []), id])
    } else {
      unassigned.push(id)
    }
  }

  for (const [id, hiddenIds] of folded) {
    folded.set(id, [...hiddenIds].sort())
  }

  return {
    visible,
    folded,
    unassigned: unassigned.sort(),
    ancestors,
  }
}

export function schemaReferenceEdges(nodes: CanvasNode[]): CanvasEdge[] {
  const schemaIds = new Set(
    nodes
      .filter((node) => entityType(node) === 'schema')
      .map((node) => node.id),
  )
  return nodes.flatMap((node) => {
    if (entityType(node) !== 'artifact') return []
    const schemaRef = field(node, 'schemaRef')
    if (!schemaRef || !schemaIds.has(schemaRef)) return []
    return [{
      id: `schema-ref:${node.id}:${schemaRef}`,
      fromNode: node.id,
      toNode: schemaRef,
      label: 'uses',
      app: { relationType: 'uses', inferred: true },
    } as CanvasEdge]
  })
}

export function levelReadiness(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
): LevelReadiness[] {
  const graph = computeLevelGraph(nodes, edges)
  const availableLevels = new Set(graph.levels.values())
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const candidates = new Set(nodes.map((node) => node.id))

  return LEVEL_DEFINITIONS.map(({ level, name }) => {
    const { unassigned } = selectVisibleCards(graph, candidates, level)
    const entries = unassigned
      .map((id) => ({ id, name: levelCardName(nodeById.get(id)!) }))
      .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))

    return {
      level,
      name,
      available: availableLevels.has(level),
      ready: entries.length === 0,
      unassigned: entries,
    }
  })
}

export function levelReadinessIssues(readiness: LevelReadiness[]): CanvasProfileIssue[] {
  const issued = new Set<string>()
  return [...readiness]
    .sort((left, right) => left.level - right.level)
    .filter((entry) => entry.available)
    .flatMap((entry) => entry.unassigned.flatMap((card) => {
      if (issued.has(card.id)) return []
      issued.add(card.id)
      return [{
        code: 'level_unassigned' as const,
        severity: 'warning' as const,
        message: `${card.name} has no owner at Level ${entry.level} ${entry.name}: add \`defines\`, \`produces\`, or \`uses\` from a System.`,
        nodeId: card.id,
        fieldKey: `level:${entry.level}`,
      }]
    }))
}
