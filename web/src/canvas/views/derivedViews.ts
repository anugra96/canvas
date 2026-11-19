import {
  ANNOTATION_ENTITY_TYPES,
  computeLevelGraph,
  entityTitle,
  findEntityType,
  findRelationType,
  schemaReferenceEdges,
  selectVisibleCards,
  type CanvasEdge,
  type CanvasNode,
  type EntityFields,
  type LevelNumber,
  type Ontology,
} from '@canvas/contract'

import {
  colorFor,
  toFlowEdge,
  type CanvasFlowEdge,
  type CanvasFlowNode,
} from '../model/adapter'

export type DerivedViewId = 'architecture' | 'runtime' | 'data-flow' | 'contracts' | 'pipeline'

export interface DerivedViewDefinition {
  id: DerivedViewId
  label: string
  description: string
}

export const DERIVED_VIEWS: DerivedViewDefinition[] = [
  {
    id: 'architecture',
    label: 'Architecture',
    description: 'All architecture cards and their explicit relations.',
  },
  {
    id: 'runtime',
    label: 'Runtime',
    description: 'Actors, systems, and artifacts in the runtime path.',
  },
  {
    id: 'data-flow',
    label: 'Data flow',
    description: 'Systems, artifacts, and schemas with their data relations.',
  },
  {
    id: 'contracts',
    label: 'Contracts',
    description: 'Schema contracts, their owners, and the surfaces they describe.',
  },
  {
    id: 'pipeline',
    label: 'Pipeline',
    description: 'Execution and delivery chain without contract or annotation cards.',
  },
]

export interface DerivedContentChip {
  typeId: string
  typeLabel: string
  count: number
}

export interface DerivedAnnotationBadge {
  typeId: 'note'
  label: string
  count: number
}

export interface DerivedUnassignedItem {
  id: string
  label: string
}

export interface DerivedCard {
  id: string
  label: string
  typeId: string
  typeLabel: string
  detail?: string
  accent?: string
  level?: LevelNumber
  contents?: DerivedContentChip[]
  canExpand?: boolean
  expanded?: boolean
  annotations?: DerivedAnnotationBadge[]
  internalRelations?: number
  isUnassigned?: boolean
  unassignedItems?: DerivedUnassignedItem[]
  height?: number
}

export interface DerivedRelation {
  id: string
  from: string
  to: string
  relationType?: string
  label: string
  count?: number
}

export interface DerivedViewLevelState {
  level: LevelNumber
  visible: string[]
  folded: Map<string, string[]>
  unassigned: string[]
  parents: Map<string, string>
}

export interface DerivedView {
  nodes: DerivedCard[]
  edges: DerivedRelation[]
  notInLevels: DerivedUnassignedItem[]
  levelState?: DerivedViewLevelState
}

export interface DerivedViewOptions {
  level?: LevelNumber
  expanded?: ReadonlySet<string>
}

export const UNASSIGNED_CARD_ID = '__unassigned__'

interface DerivedSequenceMessage extends DerivedRelation {
  order: number
}

export interface DerivedSequence {
  jobId: string
  participants: DerivedCard[]
  messages: DerivedSequenceMessage[]
}

const SEQUENCE_TYPES = new Set(['actor', 'system', 'repository', 'artifact', 'schema'])

const RELATION_RANK: Record<string, number> = {
  uses: 0,
  produces: 1,
  defines: 2,
}

const PARTICIPANT_RANK: Record<string, number> = {
  actor: 0,
  system: 1,
  repository: 2,
  artifact: 3,
  schema: 4,
}

const DISPLAY_VALUES: Record<string, string> = {
  api: 'API',
  cli: 'CLI',
  github: 'GitHub',
  gitlab: 'GitLab',
}

function displayValue(value: unknown): string {
  const text = value == null ? '' : String(value).trim()
  if (!text) return ''
  return DISPLAY_VALUES[text.toLowerCase()]
    ?? text.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

function entityTypeId(node: CanvasFlowNode): string {
  return node.data.entity?.entityType ?? 'text'
}

function nodeLabel(node: CanvasFlowNode, ontology: Ontology): string {
  const entity = node.data.entity
  const definition = entity ? findEntityType(ontology, entity.entityType) : undefined
  if (definition && entity) {
    const title = entityTitle(definition, entity.fields).trim()
    if (title) return title
  }
  const text = node.data.text ?? ''
  const firstLine = text.split('\n').find((line) => line.trim())
  if (firstLine) return firstLine.replace(/^#+\s*/, '').trim()
  if (node.data.label) return node.data.label
  return definition ? `Untitled ${definition.label.toLowerCase()}` : 'Untitled card'
}

function cardDetail(entityType: string, fields: EntityFields): string | undefined {
  if (entityType === 'schema') {
    const kind = displayValue(fields.kind)
    const version = displayValue(fields.version)
    return [kind, version ? `v${version.replace(/^v/i, '')}` : ''].filter(Boolean).join(' · ') || undefined
  }
  if (entityType === 'artifact') {
    const kind = displayValue(fields.kind)
    const version = displayValue(fields.version)
    return [kind, version ? `v${version.replace(/^v/i, '')}` : ''].filter(Boolean).join(' · ') || undefined
  }
  if (entityType === 'repository') return displayValue(fields.url) || undefined
  if (entityType === 'system') return displayValue(fields.kind) || undefined
  if (entityType === 'actor') return displayValue(fields.kind) || undefined
  return undefined
}

function cardFor(node: CanvasFlowNode, ontology: Ontology): DerivedCard {
  const entityType = entityTypeId(node)
  const definition = findEntityType(ontology, entityType)
  const fields = node.data.entity?.fields ?? {}
  return {
    id: node.id,
    label: nodeLabel(node, ontology),
    typeId: entityType,
    typeLabel: definition?.label ?? (entityType === 'text' ? 'Text' : displayValue(entityType) || 'Card'),
    detail: cardDetail(entityType, fields),
    accent: colorFor(definition?.color) ?? colorFor(node.data.raw.color),
  }
}

function relationFor(edge: CanvasFlowEdge, ontology: Ontology): DerivedRelation {
  const relationType = edge.data?.relationType
  const relation = relationType ? findRelationType(ontology, relationType) : undefined
  const customLabel = edge.data?.raw.label?.trim()
  return {
    id: edge.id,
    from: edge.source,
    to: edge.target,
    relationType,
    label: customLabel || relation?.label || relationType || 'Unspecified',
  }
}

function relatedEdges(
  edges: CanvasFlowEdge[],
  included: Set<string>,
  allowed?: Set<string>,
): CanvasFlowEdge[] {
  return edges.filter((edge) => {
    if (edge.source === edge.target) return false
    if (!included.has(edge.source) || !included.has(edge.target)) return false
    return !allowed || Boolean(edge.data?.relationType && allowed.has(edge.data.relationType))
  })
}

function plural(label: string, count: number): string {
  const lower = label.toLowerCase()
  if (count === 1) return lower
  if (lower.endsWith('y')) return `${lower.slice(0, -1)}ies`
  if (lower.endsWith('s')) return `${lower}es`
  return `${lower}s`
}

interface AnnotationTally {
  count: number
}

function annotationTallies(
  rawNodes: CanvasNode[],
  rawEdges: CanvasEdge[],
  mapCard: (id: string) => string | undefined,
): Map<string, AnnotationTally> {
  const rawById = new Map(rawNodes.map((node) => [node.id, node]))
  const tallies = new Map<string, AnnotationTally>()
  const counted = new Set<string>()

  for (const edge of rawEdges) {
    if (getEdgeRelation(edge) !== 'relates_to') continue
    const from = rawById.get(edge.fromNode)
    const to = rawById.get(edge.toNode)
    if (!from || !to) continue
    const fromType = from.app?.entityType
    const toType = to.app?.entityType
    const annotation = fromType && ANNOTATION_ENTITY_TYPES.has(fromType)
      ? from
      : toType && ANNOTATION_ENTITY_TYPES.has(toType)
        ? to
        : undefined
    if (!annotation) continue
    const other = annotation === from ? to : from
    const target = mapCard(other.id)
    if (!target) continue
    const tallyKey = `${target}:${annotation.id}`
    if (counted.has(tallyKey)) continue
    counted.add(tallyKey)
    const entry = tallies.get(target) ?? { count: 0 }
    entry.count += 1
    tallies.set(target, entry)
  }

  return tallies
}

function annotationBadges(
  tally: AnnotationTally | undefined,
): DerivedAnnotationBadge[] | undefined {
  if (!tally) return undefined
  return [{
    typeId: 'note',
    label: plural('note', tally.count),
    count: tally.count,
  }]
}

function getEdgeRelation(edge: CanvasEdge): string | undefined {
  return (edge.app as Record<string, unknown> | undefined)?.relationType as string | undefined
}

function sortedCards(nodes: CanvasFlowNode[], included: Set<string>, ontology: Ontology): DerivedCard[] {
  return nodes
    .filter((node) => included.has(node.id))
    .map((node) => cardFor(node, ontology))
    .sort((left, right) => (
      (PARTICIPANT_RANK[left.typeId] ?? 9) - (PARTICIPANT_RANK[right.typeId] ?? 9)
      || left.label.localeCompare(right.label)
      || left.id.localeCompare(right.id)
    ))
}

export function deriveView(
  nodes: CanvasFlowNode[],
  edges: CanvasFlowEdge[],
  viewId: DerivedViewId,
  ontology: Ontology,
  options: DerivedViewOptions = {},
): DerivedView {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const rawNodes = nodes.map((node) => node.data.raw)
  const rawEdges = edges.flatMap((edge) => (edge.data?.raw ? [edge.data.raw] : []))
  const schemaEdges = schemaReferenceEdges(rawNodes)
  const allEdges = [
    ...edges,
    ...schemaEdges.map((edge) => toFlowEdge(edge, ontology)),
  ]
  const included = new Set<string>()

  if (viewId === 'architecture') {
    for (const node of nodes) {
      const typeId = entityTypeId(node)
      if (node.type === 'group' || ANNOTATION_ENTITY_TYPES.has(typeId)) continue
      included.add(node.id)
    }
  } else if (viewId === 'runtime') {
    for (const node of nodes) {
      if (['actor', 'system', 'artifact'].includes(entityTypeId(node))) {
        included.add(node.id)
      }
    }
  } else if (viewId === 'data-flow') {
    for (const node of nodes) {
      if (['system', 'artifact', 'schema'].includes(entityTypeId(node))) {
        included.add(node.id)
      }
    }
  } else if (viewId === 'contracts') {
    for (const node of nodes) {
      if (entityTypeId(node) === 'schema') included.add(node.id)
    }
    for (const edge of allEdges) {
      const relation = edge.data?.relationType
      if (!relation || !['defines', 'uses'].includes(relation)) continue
      const source = nodeById.get(edge.source)
      const target = nodeById.get(edge.target)
      if (!source || !target) continue
      if (entityTypeId(source) !== 'schema' && entityTypeId(target) !== 'schema') continue
      if (['system', 'repository', 'artifact', 'schema'].includes(entityTypeId(source))) {
        included.add(source.id)
      }
      if (['system', 'repository', 'artifact', 'schema'].includes(entityTypeId(target))) {
        included.add(target.id)
      }
    }
  } else {
    for (const node of nodes) {
      if (['actor', 'repository', 'system', 'artifact'].includes(entityTypeId(node))) {
        included.add(node.id)
      }
    }
  }

  const allowedByView: Record<Exclude<DerivedViewId, 'architecture'>, Set<string>> = {
    runtime: new Set(['uses', 'produces']),
    'data-flow': new Set(['uses', 'produces', 'defines']),
    contracts: new Set(['defines', 'uses']),
    pipeline: new Set(['uses', 'produces']),
  }

  const viewEdges = relatedEdges(
    allEdges,
    included,
    viewId === 'architecture' ? undefined : allowedByView[viewId],
  )

  const level = options.level
  if (level == null) {
    const relations = viewEdges.map((edge) => relationFor(edge, ontology))
    return {
      nodes: sortedCards(nodes, included, ontology),
      edges: relations.sort(compareRelations),
      notInLevels: [],
    }
  }

  const graph = computeLevelGraph(rawNodes, rawEdges)
  const expanded = new Set(options.expanded ?? [])
  const selection = selectVisibleCards(graph, included, level, expanded)
  const unassigned = new Set(selection.unassigned)
  const internal = new Map<string, number>()
  const merged = new Map<string, Array<{ from: string; to: string; relation: DerivedRelation }>>()
  const flowById = new Map(nodes.map((node) => [node.id, node]))
  const rawById = new Map(rawNodes.map((node) => [node.id, node]))

  function mapEnd(id: string): string | undefined {
    if (selection.visible.has(id)) return id
    const ancestor = selection.ancestors.get(id)
    if (ancestor) return ancestor
    if (unassigned.has(id)) return UNASSIGNED_CARD_ID
    return undefined
  }

  for (const edge of viewEdges) {
    const from = mapEnd(edge.source)
    const to = mapEnd(edge.target)
    if (!from || !to) continue
    if (from === to) {
      internal.set(from, (internal.get(from) ?? 0) + 1)
      continue
    }
    const relation = relationFor(edge, ontology)
    const key = `${from}\u0000${to}\u0000${relation.relationType ?? ''}`
    merged.set(key, [...(merged.get(key) ?? []), { from, to, relation }])
  }

  const relations = [...merged.values()].map((group) => {
    const first = group[0]!
    const count = group.length
    return {
      ...first.relation,
      id: count === 1
        ? first.relation.id
        : `merged:${first.from}:${first.to}:${first.relation.relationType ?? 'none'}`,
      from: first.from,
      to: first.to,
      label: count > 1 ? `${first.relation.label} ×${count}` : first.relation.label,
      count,
    }
  }).sort(compareRelations)

  const annotations = annotationTallies(rawNodes, rawEdges, mapEnd)

  const cards: DerivedCard[] = sortedCards(nodes, selection.visible, ontology).map((card) => {
    const foldedIds = selection.folded.get(card.id) ?? []
    const contents = foldedIds.length > 0 ? contentsFor(foldedIds, rawById, ontology) : undefined
    const badges = annotationBadges(annotations.get(card.id))
    const internalRelations = internal.get(card.id)
    const height = contents || badges || internalRelations
      ? 112
      : undefined
    return {
      ...card,
      level: graph.levels.get(card.id),
      contents,
      canExpand: foldedIds.length > 0,
      expanded: expanded.has(card.id),
      annotations: badges,
      internalRelations,
      height,
    }
  })

  if (selection.unassigned.length > 0) {
    const items = selection.unassigned
      .map((id) => ({
        id,
        label: flowById.get(id) ? nodeLabel(flowById.get(id)!, ontology) : id,
      }))
      .sort((left, right) => left.label.localeCompare(right.label) || left.id.localeCompare(right.id))
    const badges = annotationBadges(annotations.get(UNASSIGNED_CARD_ID))
    const internalRelations = internal.get(UNASSIGNED_CARD_ID)
    cards.push({
      id: UNASSIGNED_CARD_ID,
      label: `Unassigned (${items.length})`,
      typeId: 'unassigned',
      typeLabel: 'Unassigned',
      detail: 'No owner at this level.',
      accent: '#8a94a0',
      level,
      annotations: badges,
      internalRelations,
      isUnassigned: true,
      unassignedItems: items,
      height: Math.min(360, 84 + items.length * 22 + (badges ? 18 : 0)),
    })
  }

  const notInLevels = [...included]
    .filter((id) => {
      if (graph.levels.has(id)) return false
      const node = rawById.get(id)
      if (!node || node.type === 'group') return false
      const typeId = node.app?.entityType
      return !typeId || !ANNOTATION_ENTITY_TYPES.has(typeId)
    })
    .map((id) => ({
      id,
      label: flowById.get(id) ? nodeLabel(flowById.get(id)!, ontology) : id,
    }))
    .sort((left, right) => left.label.localeCompare(right.label) || left.id.localeCompare(right.id))

  return {
    nodes: cards,
    edges: relations,
    notInLevels,
    levelState: {
      level,
      visible: [...selection.visible].sort(),
      folded: selection.folded,
      unassigned: selection.unassigned,
      parents: graph.parents,
    },
  }
}

function compareRelations(left: DerivedRelation, right: DerivedRelation): number {
  return (RELATION_RANK[left.relationType ?? ''] ?? 9) - (RELATION_RANK[right.relationType ?? ''] ?? 9)
    || left.from.localeCompare(right.from)
    || left.to.localeCompare(right.to)
    || left.id.localeCompare(right.id)
}

function contentsFor(
  ids: string[],
  rawById: Map<string, CanvasNode>,
  ontology: Ontology,
): DerivedContentChip[] {
  const groups = new Map<string, DerivedContentChip>()
  for (const id of ids) {
    const node = rawById.get(id)
    if (!node) continue
    const typeId = node.app?.entityType ?? 'text'
    const typeLabel = findEntityType(ontology, typeId)?.label
      ?? (displayValue(typeId) || 'Card')
    const current = groups.get(typeId) ?? { typeId, typeLabel, count: 0 }
    current.count += 1
    groups.set(typeId, current)
  }
  return [...groups.values()].sort((left, right) => (
    (PARTICIPANT_RANK[left.typeId] ?? 9) - (PARTICIPANT_RANK[right.typeId] ?? 9)
    || left.typeLabel.localeCompare(right.typeLabel)
  ))
}

export function sequenceJobOptions(
  nodes: CanvasFlowNode[],
  ontology: Ontology,
): DerivedCard[] {
  return nodes
    .filter((node) => entityTypeId(node) === 'system'
      && String(node.data.entity?.fields.kind ?? '') === 'job')
    .map((node) => cardFor(node, ontology))
    .sort((left, right) => left.label.localeCompare(right.label) || left.id.localeCompare(right.id))
}

export function recommendedSequenceJobId(
  nodes: CanvasFlowNode[],
  edges: CanvasFlowEdge[],
  ontology: Ontology,
): string | undefined {
  const options = sequenceJobOptions(nodes, ontology)
  if (options.length === 0) return undefined
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const counts = new Map<string, number>()
  for (const edge of edges) {
    const relation = edge.data?.relationType
    if (!relation || relation === 'relates_to') continue
    for (const nodeId of [edge.source, edge.target]) {
      const node = nodeById.get(nodeId)
      if (node && entityTypeId(node) === 'system'
        && String(node.data.entity?.fields.kind ?? '') === 'job') {
        counts.set(nodeId, (counts.get(nodeId) ?? 0) + 1)
      }
    }
  }
  return [...options].sort((left, right) => (
    (counts.get(right.id) ?? 0) - (counts.get(left.id) ?? 0)
    || left.label.localeCompare(right.label)
    || left.id.localeCompare(right.id)
  ))[0]?.id
}

export function deriveSequence(
  nodes: CanvasFlowNode[],
  edges: CanvasFlowEdge[],
  jobId: string | undefined,
  ontology: Ontology,
): DerivedSequence {
  const jobOptions = sequenceJobOptions(nodes, ontology)
  const recommendedId = recommendedSequenceJobId(nodes, edges, ontology)
  const job = jobOptions.find((option) => option.id === jobId)
    ?? jobOptions.find((option) => option.id === recommendedId)
    ?? jobOptions[0]
  if (!job) {
    return { jobId: '', participants: [], messages: [] }
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const usableEdges = edges
    .filter((edge) => {
      if (edge.source === edge.target) return false
      const relation = edge.data?.relationType
      if (!relation || relation === 'relates_to') return false
      const source = nodeById.get(edge.source)
      const target = nodeById.get(edge.target)
      return Boolean(
        source
        && target
        && SEQUENCE_TYPES.has(entityTypeId(source))
        && SEQUENCE_TYPES.has(entityTypeId(target)),
      )
    })
  const incident = new Map<string, CanvasFlowEdge[]>()
  for (const edge of usableEdges) {
    incident.set(edge.source, [...(incident.get(edge.source) ?? []), edge])
    incident.set(edge.target, [...(incident.get(edge.target) ?? []), edge])
  }

  const included = new Set([job.id])
  let frontier = [job.id]
  for (let depth = 0; depth < 2; depth += 1) {
    const next: string[] = []
    for (const nodeId of frontier) {
      for (const edge of incident.get(nodeId) ?? []) {
        const other = edge.source === nodeId ? edge.target : edge.source
        if (included.has(other)) continue
        included.add(other)
        next.push(other)
      }
    }
    frontier = next
    if (frontier.length === 0) break
  }

  const participants = sortedCards(nodes, included, ontology)
  const participantIndex = new Map(participants.map((participant, index) => [participant.id, index]))
  const messages = usableEdges
    .filter((edge) => included.has(edge.source) && included.has(edge.target))
    .map((edge) => relationFor(edge, ontology))
    .sort((left, right) => {
      const phase = (message: DerivedRelation) => {
        if (message.to === job.id && message.relationType === 'uses') return 0
        if (message.from === job.id) return 1
        if (message.to === job.id) return 2
        return 3
      }
      return phase(left) - phase(right)
        || (RELATION_RANK[left.relationType ?? ''] ?? 9) - (RELATION_RANK[right.relationType ?? ''] ?? 9)
        || (participantIndex.get(left.from) ?? 99) - (participantIndex.get(right.from) ?? 99)
        || (participantIndex.get(left.to) ?? 99) - (participantIndex.get(right.to) ?? 99)
        || left.id.localeCompare(right.id)
    })
    .map((message, index) => ({ ...message, order: index + 1 }))

  return {
    jobId: job.id,
    participants,
    messages,
  }
}
