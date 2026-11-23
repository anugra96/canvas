import {
  allowedRelationTypes,
  entityTitle,
  findEntityType,
  findRelationType,
  getEntityMeta,
  type CanvasProfile,
  type CanvasProfileIssue,
  type Ontology,
} from '@canvas/contract'

import type { CanvasFlowEdge, CanvasFlowNode } from '../model/adapter'
import type { PrioritizedValidationIssue } from './prioritizeIssues'
import { validationIssueKey } from './validationIdentity'
import { semanticSuggestionForIssue, type SemanticSuggestion } from '../semantics/semanticSuggestion'

interface RelationChoice {
  id: string
  label: string
}

export interface SafeRelationFix {
  edgeId: string
  fingerprint: string
  relationType: string
  relationLabel: string
  source: string
  target: string
  reason: string
}

interface RelationRepair {
  edgeId: string
  fromName: string
  toName: string
  fromType: string
  toType: string
  currentRelation?: string
  choices: RelationChoice[]
  reverseChoices: RelationChoice[]
  safe?: SafeRelationFix
}

export interface ValidationIssueView {
  issue: CanvasProfileIssue
  connections: number
  score: number
  key: string
  title: string
  summary: string
  meta: string
  why: string
  relationRepair?: RelationRepair
  suggestion?: SemanticSuggestion
  ignoredReason?: string
}

export interface ValidationGroup {
  key: CanvasProfileIssue['code']
  label: string
  category: string
  why: string
  severity: 'error' | 'warning'
  issues: ValidationIssueView[]
  safeFixes: SafeRelationFix[]
}

const ISSUE_COPY: Record<CanvasProfileIssue['code'], { label: string; why: string }> = {
  untyped_text: {
    label: 'Untyped text',
    why: 'Change the text card to a note.',
  },
  unknown_entity_type: {
    label: 'Unknown card type',
    why: 'Choose a card type supported by this profile.',
  },
  missing_required_field: {
    label: 'Missing required field',
    why: 'Fill the empty required fields.',
  },
  missing_relation_type: {
    label: 'Missing relation type',
    why: 'Choose what each link does.',
  },
  unknown_relation_type: {
    label: 'Unknown relation type',
    why: 'Choose a relation from this profile.',
  },
  relation_not_allowed: {
    label: 'Relation not allowed',
    why: 'Change the relation or the card types.',
  },
  group_endpoint: {
    label: 'Group used as endpoint',
    why: 'Connect cards, not groups.',
  },
  missing_endpoint: {
    label: 'Missing edge endpoint',
    why: 'Reconnect or delete the link.',
  },
  schema_invalid: {
    label: 'Invalid schema',
    why: 'Fix the schema source.',
  },
  schema_ref_missing: {
    label: 'Missing shared schema',
    why: 'Choose a Schema card on this canvas.',
  },
  schema_review: {
    label: 'Schema review due',
    why: 'Review the contract or update its review date.',
  },
  schema_unlinked: {
    label: 'Unlinked schema',
    why: 'Connect each schema to what it describes.',
  },
  schema_contract: {
    label: 'Contract gap',
    why: 'Link a reviewed schema to each active surface.',
  },
  artifact_without_producer: {
    label: 'Artifact has no producer',
    why: 'Add a System or Repository with a produces link.',
  },
  example_invalid: {
    label: 'Invalid example',
    why: 'Replace the example or fix the schema.',
  },
  operation_invalid: {
    label: 'Invalid operation',
    why: 'Fix the operation JSON to match OpenAPI 3.1.',
  },
  ref_unresolved: {
    label: 'Unresolved reference',
    why: 'Create the missing Schema card or extra component.',
  },
  operation_duplicate: {
    label: 'Duplicate operation',
    why: 'Give each endpoint a unique method, path, and operationId.',
  },
  path_parameter_mismatch: {
    label: 'Path parameter mismatch',
    why: 'Add the missing path parameter.',
  },
  response_success_missing: {
    label: 'Missing success response',
    why: 'Add a 2XX or 3XX response.',
  },
  mutation_errors_missing: {
    label: 'Missing error response',
    why: 'Add standard error responses.',
  },
  security_missing: {
    label: 'Missing security',
    why: 'Inherit API security, choose a scheme, or mark the endpoint public.',
  },
  list_pagination_missing: {
    label: 'Missing pagination',
    why: 'Add limit and cursor parameters.',
  },
  get_with_body: {
    label: 'Unexpected request body',
    why: 'Remove the body from this method.',
  },
  naming_inconsistent: {
    label: 'Inconsistent naming',
    why: 'Match the canvas majority case style.',
  },
  schema_unused: {
    label: 'Unused schema',
    why: 'Reference the schema or remove it.',
  },
  endpoint_without_resource: {
    label: 'Endpoint without resource',
    why: 'Add a tag to place the endpoint in a Resource.',
  },
  endpoint_stale: {
    label: 'Endpoint no longer exists',
    why: 'Choose an endpoint that exists in the linked API canvas, or clear it.',
  },
  level_unassigned: {
    label: 'Unassigned at level',
    why: 'Add a uses, produces, or defines line from a System so the card folds into a visible parent.',
  },
  unzoned_card: {
    label: 'System outside any owned group',
    why: 'Move the System into a group that has an owner, or give its group an owner.',
  },
  district_without_owner: {
    label: 'Group owner missing',
    why: 'Choose an Actor on this canvas as the group owner.',
  },
  shared_landmark: {
    label: 'Database used by more than one team',
    why: 'Give each team its own database, or call the owning team through its API.',
  },
  route_bypasses_gate: {
    label: "Call skips the other team's API",
    why: "Call the other team's API or queue, not its database or internal services.",
  },
}

function isZoningCode(code: CanvasProfileIssue['code']): boolean {
  return code === 'unzoned_card'
    || code === 'district_without_owner'
    || code === 'shared_landmark'
    || code === 'route_bypasses_gate'
}

function issueCategory(code: CanvasProfileIssue['code']): string {
  if (isZoningCode(code)) return 'Ownership'
  if (code.startsWith('schema_')) return 'Schema'
  if (code.startsWith('example_')) return 'Examples'
  if (code === 'operation_invalid' || code === 'ref_unresolved' || code === 'operation_duplicate') return 'API'
  if (code === 'path_parameter_mismatch' || code === 'get_with_body') return 'API'
  if (code === 'response_success_missing' || code === 'mutation_errors_missing') return 'API'
  if (code === 'security_missing' || code === 'endpoint_without_resource') return 'API'
  if (code === 'list_pagination_missing' || code === 'naming_inconsistent' || code === 'schema_unused') return 'API'
  if (code === 'endpoint_stale') return 'API'
  if (code.includes('relation')) return 'Relation'
  if (code.includes('without')) return 'Semantics'
  if (code.includes('group')) return 'Group'
  return 'Architecture'
}

function issueGroupLabel(code: CanvasProfileIssue['code']): string {
  return ISSUE_COPY[code].label
}

function issueWhy(code: CanvasProfileIssue['code']): string {
  return ISSUE_COPY[code].why
}

function nodeEntity(node: CanvasFlowNode | undefined) {
  return node ? getEntityMeta(node.data.raw) : undefined
}

function nodeDisplayName(
  node: CanvasFlowNode | undefined,
  ontology: Ontology,
): string {
  if (!node) return 'Missing card'
  const entity = nodeEntity(node)
  const type = entity ? findEntityType(ontology, entity.entityType) : undefined
  const title = entity && type ? entityTitle(type, entity.fields).trim() : ''
  if (title) return title
  if (typeof node.data.label === 'string' && node.data.label.trim()) return node.data.label.trim()
  return type?.label ? `Untitled ${type.label}` : 'Untitled card'
}

function nodeTypeLabel(node: CanvasFlowNode | undefined, ontology: Ontology): string {
  const entity = nodeEntity(node)
  const type = entity ? findEntityType(ontology, entity.entityType) : undefined
  return type?.label ?? entity?.entityType ?? node?.type ?? 'Card'
}

function relationLabel(relationType: string | undefined, ontology: Ontology): string {
  if (!relationType) return 'No relation'
  return findRelationType(ontology, relationType)?.label ?? relationType
}

function fieldLabel(node: CanvasFlowNode | undefined, fieldKey: string | undefined, ontology: Ontology): string {
  const entity = nodeEntity(node)
  const type = entity ? findEntityType(ontology, entity.entityType) : undefined
  return type?.fields.find((field) => field.key === fieldKey)?.label ?? fieldKey ?? 'field'
}

function summaryForIssue(
  issue: CanvasProfileIssue,
  edge: CanvasFlowEdge | undefined,
  node: CanvasFlowNode | undefined,
  ontology: Ontology,
): string {
  const relation = edge?.data?.relationType
  switch (issue.code) {
    case 'missing_relation_type':
      return 'No relation type is set.'
    case 'unknown_relation_type':
      return `Relation "${relationLabel(relation, ontology)}" is outside this profile.`
    case 'relation_not_allowed':
      return `Relation "${relationLabel(relation, ontology)}" is not allowed between these card types.`
    case 'missing_required_field':
      return `Required field "${fieldLabel(node, issue.fieldKey, ontology)}" is empty.`
    case 'unknown_entity_type':
      return 'This card uses a type outside the active profile.'
    case 'untyped_text':
      return 'This text card has no architecture type.'
    case 'group_endpoint':
      return 'A group cannot be an architecture endpoint.'
    case 'missing_endpoint':
      return 'This connection references a missing card.'
    default:
      return issue.message
  }
}

function contextForIssue(
  issue: CanvasProfileIssue,
  nodesById: Map<string, CanvasFlowNode>,
  edgesById: Map<string, CanvasFlowEdge>,
  ontology: Ontology,
): { title: string; meta: string } {
  if (issue.edgeId) {
    const edge = edgesById.get(issue.edgeId)
    if (!edge) return { title: 'Connection', meta: 'Missing edge' }
    const from = nodesById.get(edge.source)
    const to = nodesById.get(edge.target)
    const fromType = nodeTypeLabel(from, ontology)
    const toType = nodeTypeLabel(to, ontology)
    const relation = edge.data?.relationType
    return {
      title: `${nodeDisplayName(from, ontology)} → ${nodeDisplayName(to, ontology)}`,
      meta: relation
        ? `${fromType} → ${toType} · ${relationLabel(relation, ontology)}`
        : `${fromType} → ${toType}`,
    }
  }
  if (issue.nodeId) {
    const node = nodesById.get(issue.nodeId)
    const type = nodeTypeLabel(node, ontology)
    const field = issue.fieldKey ? ` · field "${fieldLabel(node, issue.fieldKey, ontology)}"` : ''
    return {
      title: nodeDisplayName(node, ontology),
      meta: `${type}${field}`,
    }
  }
  return { title: issue.message, meta: 'Canvas' }
}

function relationRepairForIssue(
  issue: CanvasProfileIssue,
  nodesById: Map<string, CanvasFlowNode>,
  edgesById: Map<string, CanvasFlowEdge>,
  profile: CanvasProfile,
  ontology: Ontology,
): RelationRepair | undefined {
  if (!issue.edgeId) return undefined
  const edge = edgesById.get(issue.edgeId)
  if (!edge) return undefined
  const from = nodesById.get(edge.source)
  const to = nodesById.get(edge.target)
  const fromEntity = nodeEntity(from)
  const toEntity = nodeEntity(to)
  if (!fromEntity || !toEntity) return undefined
  const allowed = allowedRelationTypes(profile, fromEntity.entityType, toEntity.entityType)
  const choices = allowed.map((id) => ({
    id,
    label: findRelationType(ontology, id)?.label ?? id,
  }))
  const reverseChoices = allowedRelationTypes(profile, toEntity.entityType, fromEntity.entityType)
    .map((id) => ({
      id,
      label: findRelationType(ontology, id)?.label ?? id,
    }))

  let safe: SafeRelationFix | undefined
  if (issue.code === 'missing_relation_type' && choices.length > 0) {
    const edgeLabel = edge.data?.label?.trim().toLowerCase()
    const byLabel = edgeLabel && edgeLabel !== 'define relation'
      ? choices.find((choice) => (
        choice.id.toLowerCase() === edgeLabel || choice.label.toLowerCase() === edgeLabel
      ))
      : undefined
    const choice = byLabel ?? (choices.length === 1 ? choices[0] : undefined)
    if (choice) {
      safe = {
        edgeId: edge.id,
        fingerprint: validationIssueKey(issue),
        relationType: choice.id,
        relationLabel: choice.label,
        source: nodeDisplayName(from, ontology),
        target: nodeDisplayName(to, ontology),
        reason: byLabel
          ? 'The edge label matches this relation.'
          : 'This is the only legal relation for these card types.',
      }
    }
  }

  return {
    edgeId: edge.id,
    fromName: nodeDisplayName(from, ontology),
    toName: nodeDisplayName(to, ontology),
    fromType: fromEntity.entityType,
    toType: toEntity.entityType,
    currentRelation: edge.data?.relationType,
    choices,
    reverseChoices,
    safe,
  }
}

export function buildValidationGroups(
  entries: PrioritizedValidationIssue[],
  nodes: CanvasFlowNode[],
  edges: CanvasFlowEdge[],
  profile: CanvasProfile,
  ontology: Ontology,
  ignoredReasons: Map<string, string> = new Map(),
): ValidationGroup[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const edgesById = new Map(edges.map((edge) => [edge.id, edge]))
  const groups = new Map<CanvasProfileIssue['code'], ValidationGroup>()

  for (const entry of entries) {
    const { issue } = entry
    const context = contextForIssue(issue, nodesById, edgesById, ontology)
    const relationRepair = relationRepairForIssue(issue, nodesById, edgesById, profile, ontology)
    const key = validationIssueKey(issue)
    const view: ValidationIssueView = {
      issue,
      connections: entry.connections,
      score: entry.score,
      key,
      title: context.title,
      summary: summaryForIssue(issue, issue.edgeId ? edgesById.get(issue.edgeId) : undefined, issue.nodeId ? nodesById.get(issue.nodeId) : undefined, ontology),
      meta: context.meta,
      why: issueWhy(issue.code),
      relationRepair,
      suggestion: semanticSuggestionForIssue(issue),
      ignoredReason: ignoredReasons.get(key),
    }
    const group = groups.get(issue.code)
    if (group) {
      group.issues.push(view)
      if (issue.severity === 'error') group.severity = 'error'
      if (relationRepair?.safe) group.safeFixes.push(relationRepair.safe)
    } else {
      groups.set(issue.code, {
        key: issue.code,
        label: issueGroupLabel(issue.code),
        category: issueCategory(issue.code),
        why: issueWhy(issue.code),
        severity: issue.severity,
        issues: [view],
        safeFixes: relationRepair?.safe ? [relationRepair.safe] : [],
      })
    }
  }

  return [...groups.values()]
}

export function safeFixesForGroups(groups: ValidationGroup[]): SafeRelationFix[] {
  return groups.flatMap((group) => group.safeFixes)
}
