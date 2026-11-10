import {
  entityTitle,
  findEntityType,
  findRelationType,
  type EntityFields,
  type Ontology,
} from '@canvas/contract'

import { colorFor, type CanvasFlowEdge, type CanvasFlowNode } from '../model/adapter'

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
    description: 'Actors, systems, processes, and artifacts in the runtime path.',
  },
  {
    id: 'data-flow',
    label: 'Data flow',
    description: 'Systems, processes, artifacts, and schemas with their data relations.',
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

export interface DerivedCard {
  id: string
  label: string
  typeId: string
  typeLabel: string
  detail?: string
  accent?: string
}

export interface DerivedRelation {
  id: string
  from: string
  to: string
  relationType?: string
  label: string
}

export interface DerivedView {
  nodes: DerivedCard[]
  edges: DerivedRelation[]
}

interface DerivedSequenceMessage extends DerivedRelation {
  order: number
}

export interface DerivedSequence {
  processId: string
  participants: DerivedCard[]
  messages: DerivedSequenceMessage[]
}

const ANNOTATION_TYPES = new Set(['note', 'decision', 'risk'])
const SEQUENCE_TYPES = new Set(['actor', 'system', 'repository', 'process', 'artifact', 'schema'])

const RELATION_RANK: Record<string, number> = {
  runs: 0,
  uses: 1,
  produces: 2,
  defines: 3,
  describes: 4,
}

const PARTICIPANT_RANK: Record<string, number> = {
  actor: 0,
  process: 1,
  system: 2,
  repository: 3,
  artifact: 4,
  schema: 5,
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
  if (entityType === 'repository') return displayValue(fields.provider) || undefined
  if (entityType === 'system') return displayValue(fields.kind) || undefined
  if (entityType === 'process') return displayValue(fields.mode) || undefined
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
): DerivedView {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const included = new Set<string>()

  if (viewId === 'architecture') {
    for (const node of nodes) {
      const typeId = entityTypeId(node)
      if (node.type === 'group' || ANNOTATION_TYPES.has(typeId)) continue
      included.add(node.id)
    }
  } else if (viewId === 'runtime') {
    for (const node of nodes) {
      if (['actor', 'system', 'process', 'artifact'].includes(entityTypeId(node))) {
        included.add(node.id)
      }
    }
  } else if (viewId === 'data-flow') {
    for (const node of nodes) {
      if (['system', 'process', 'artifact', 'schema'].includes(entityTypeId(node))) {
        included.add(node.id)
      }
    }
  } else if (viewId === 'contracts') {
    for (const node of nodes) {
      if (entityTypeId(node) === 'schema') included.add(node.id)
    }
    for (const edge of edges) {
      const relation = edge.data?.relationType
      if (!relation || !['defines', 'describes', 'uses'].includes(relation)) continue
      const source = nodeById.get(edge.source)
      const target = nodeById.get(edge.target)
      if (!source || !target) continue
      if (entityTypeId(source) !== 'schema' && entityTypeId(target) !== 'schema') continue
      if (['system', 'repository', 'process', 'schema'].includes(entityTypeId(source))) {
        included.add(source.id)
      }
      if (['system', 'repository', 'process', 'schema'].includes(entityTypeId(target))) {
        included.add(target.id)
      }
    }
  } else {
    for (const node of nodes) {
      if (['actor', 'repository', 'system', 'process', 'artifact'].includes(entityTypeId(node))) {
        included.add(node.id)
      }
    }
  }

  const allowedByView: Record<Exclude<DerivedViewId, 'architecture'>, Set<string>> = {
    runtime: new Set(['runs', 'uses', 'produces']),
    'data-flow': new Set(['uses', 'produces', 'defines', 'describes']),
    contracts: new Set(['defines', 'describes', 'uses']),
    pipeline: new Set(['runs', 'uses', 'produces']),
  }

  const relations = relatedEdges(
    edges,
    included,
    viewId === 'architecture' ? undefined : allowedByView[viewId],
  ).map((edge) => relationFor(edge, ontology))

  return {
    nodes: sortedCards(nodes, included, ontology),
    edges: relations.sort((left, right) => (
      (RELATION_RANK[left.relationType ?? ''] ?? 9) - (RELATION_RANK[right.relationType ?? ''] ?? 9)
      || left.from.localeCompare(right.from)
      || left.to.localeCompare(right.to)
      || left.id.localeCompare(right.id)
    )),
  }
}

export function sequenceProcessOptions(
  nodes: CanvasFlowNode[],
  ontology: Ontology,
): DerivedCard[] {
  return nodes
    .filter((node) => entityTypeId(node) === 'process')
    .map((node) => cardFor(node, ontology))
    .sort((left, right) => left.label.localeCompare(right.label) || left.id.localeCompare(right.id))
}

export function recommendedSequenceProcessId(
  nodes: CanvasFlowNode[],
  edges: CanvasFlowEdge[],
  ontology: Ontology,
): string | undefined {
  const options = sequenceProcessOptions(nodes, ontology)
  if (options.length === 0) return undefined
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const counts = new Map<string, number>()
  for (const edge of edges) {
    const relation = edge.data?.relationType
    if (!relation || relation === 'relates_to') continue
    for (const nodeId of [edge.source, edge.target]) {
      const node = nodeById.get(nodeId)
      if (node && entityTypeId(node) === 'process') {
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
  processId: string | undefined,
  ontology: Ontology,
): DerivedSequence {
  const processOptions = sequenceProcessOptions(nodes, ontology)
  const recommendedId = recommendedSequenceProcessId(nodes, edges, ontology)
  const process = processOptions.find((option) => option.id === processId)
    ?? processOptions.find((option) => option.id === recommendedId)
    ?? processOptions[0]
  if (!process) {
    return { processId: '', participants: [], messages: [] }
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

  const included = new Set([process.id])
  let frontier = [process.id]
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
        if (message.to === process.id && message.relationType === 'runs') return 0
        if (message.from === process.id) return 1
        if (message.to === process.id) return 2
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
    processId: process.id,
    participants,
    messages,
  }
}
