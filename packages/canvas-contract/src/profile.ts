import { z } from 'zod'

import type { CanvasEdge, CanvasNode, JsonCanvas } from './jsonCanvas'
import {
  findEntityType,
  getEdgeMeta,
  getEntityMeta,
  type Ontology,
} from './ontology'
import { DATABASE_TARGETS } from './databaseTarget'
import { canvasDistrictsEnabled } from './districts'
import { validateZoning } from './zoning'

export const canvasProfileRelationRuleSchema = z.object({
  relationType: z.string().min(1),
  from: z.array(z.string().min(1)).min(1),
  to: z.array(z.string().min(1)).min(1),
})

export const canvasProfileSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  version: z.number().int().positive(),
  description: z.string().optional(),
  scope: z.string().min(1).optional(),
  allowUntypedText: z.boolean(),
  allowUnlistedEntityTypes: z.boolean(),
  allowUnlistedRelationTypes: z.boolean(),
  requireRelationType: z.boolean(),
  entityTypes: z.array(z.string().min(1)),
  annotationTypes: z.array(z.string().min(1)),
  relationTypes: z.array(z.string().min(1)),
  relationRules: z.array(canvasProfileRelationRuleSchema),
})

export const canvasProfileMetadataSchema = z
  .object({
    profile: z.string().min(1),
    profileVersion: z.number().int().positive(),
    scope: z.string().min(1).optional(),
    reviewMode: z.enum(['sketch', 'design', 'publish']).optional(),
    // false turns districts off for the canvas: no zoning rules, no district controls. Absent means on.
    districts: z.boolean().optional(),
    target: z.enum(DATABASE_TARGETS).optional(),
  })
  .passthrough()

export type CanvasProfileRelationRule = z.infer<typeof canvasProfileRelationRuleSchema>
export type CanvasProfile = z.infer<typeof canvasProfileSchema>
export type CanvasProfileMetadata = z.infer<typeof canvasProfileMetadataSchema>

export type ProfileRelationValidation =
  | { ok: true; rule?: CanvasProfileRelationRule }
  | { ok: false; reason: 'unknown_relation' | 'relation_not_allowed' }

export const PROFILE_ISSUE_CODES = [
  'untyped_text',
  'unknown_entity_type',
  'missing_required_field',
  'missing_relation_type',
  'unknown_relation_type',
  'relation_not_allowed',
  'group_endpoint',
  'missing_endpoint',
  'schema_invalid',
  'schema_review',
  'schema_unlinked',
  'schema_ref_missing',
  'schema_contract',
  'artifact_without_producer',
  'example_invalid',
  'operation_invalid',
  'ref_unresolved',
  'operation_duplicate',
  'path_parameter_mismatch',
  'response_success_missing',
  'mutation_errors_missing',
  'security_missing',
  'list_pagination_missing',
  'get_with_body',
  'naming_inconsistent',
  'schema_unused',
  'endpoint_without_resource',
  'endpoint_stale',
  'level_unassigned',
  'unzoned_card',
  'district_without_owner',
  'shared_landmark',
  'route_bypasses_gate',
] as const

export type ProfileIssueCode = (typeof PROFILE_ISSUE_CODES)[number]

export interface CanvasProfileIssue {
  code: ProfileIssueCode
  severity: 'warning' | 'error'
  message: string
  nodeId?: string
  edgeId?: string
  fieldKey?: string
}

export const RAW_PROFILE: CanvasProfile = {
  id: 'raw',
  label: 'Raw canvas',
  version: 1,
  description: 'Freeform JSON Canvas with optional templates and relations.',
  allowUntypedText: true,
  allowUnlistedEntityTypes: true,
  allowUnlistedRelationTypes: true,
  requireRelationType: false,
  entityTypes: [],
  annotationTypes: [],
  relationTypes: [],
  relationRules: [],
}

export const SYSTEMS_PROFILE: CanvasProfile = {
  id: 'systems',
  label: 'Systems',
  version: 5,
  description: 'Minimal systems design and architecture review with JSON Schema contracts.',
  scope: 'container',
  allowUntypedText: false,
  allowUnlistedEntityTypes: false,
  allowUnlistedRelationTypes: false,
  requireRelationType: true,
  entityTypes: ['system', 'repository', 'actor', 'artifact', 'schema'],
  annotationTypes: ['note'],
  relationTypes: [
    'uses',
    'produces',
    'defines',
    'relates_to',
  ],
  relationRules: [
    {
      relationType: 'uses',
      from: ['actor', 'system', 'repository'],
      to: ['system', 'repository', 'artifact', 'schema'],
    },
    { relationType: 'uses', from: ['schema'], to: ['schema'] },
    { relationType: 'produces', from: ['system', 'repository'], to: ['artifact'] },
    { relationType: 'defines', from: ['system', 'repository'], to: ['schema'] },
    { relationType: 'relates_to', from: ['note'], to: ['*'] },
    {
      relationType: 'relates_to',
      from: ['system', 'repository', 'actor', 'artifact', 'schema'],
      to: ['note'],
    },
  ],
}
export const API_PROFILE: CanvasProfile = {
  id: 'api',
  label: 'API',
  version: 1,
  description: 'One OpenAPI 3.1 HTTP API at endpoint level.',
  scope: 'container',
  allowUntypedText: false,
  allowUnlistedEntityTypes: false,
  allowUnlistedRelationTypes: false,
  requireRelationType: true,
  entityTypes: ['api_definition', 'resource', 'endpoint', 'security_scheme', 'schema'],
  annotationTypes: ['note'],
  relationTypes: [
    'contains',
    'accepts',
    'returns',
    'authenticates_via',
    'uses',
    'relates_to',
  ],
  relationRules: [
    { relationType: 'contains', from: ['api_definition'], to: ['resource', 'security_scheme'] },
    { relationType: 'contains', from: ['resource'], to: ['endpoint'] },
    { relationType: 'accepts', from: ['endpoint'], to: ['schema'] },
    { relationType: 'returns', from: ['endpoint'], to: ['schema'] },
    {
      relationType: 'authenticates_via',
      from: ['api_definition', 'resource', 'endpoint'],
      to: ['security_scheme'],
    },
    { relationType: 'uses', from: ['schema'], to: ['schema'] },
    {
      relationType: 'relates_to',
      from: ['note'],
      to: ['*'],
    },
    {
      relationType: 'relates_to',
      from: ['api_definition', 'resource', 'endpoint', 'security_scheme', 'schema'],
      to: ['note'],
    },
  ],
}
export const DATABASE_PROFILE: CanvasProfile = {
  id: 'database',
  label: 'Database',
  version: 1,
  description: 'One PostgreSQL database at table and column level.',
  scope: 'container',
  allowUntypedText: false,
  allowUnlistedEntityTypes: false,
  allowUnlistedRelationTypes: false,
  requireRelationType: true,
  entityTypes: ['database_definition', 'db_schema', 'table', 'db_enum'],
  annotationTypes: ['note'],
  relationTypes: ['references', 'relates_to'],
  relationRules: [
    { relationType: 'references', from: ['table'], to: ['table'] },
    { relationType: 'relates_to', from: ['note'], to: ['*'] },
    {
      relationType: 'relates_to',
      from: ['database_definition', 'db_schema', 'table', 'db_enum'],
      to: ['note'],
    },
  ],
}
export const DEFAULT_PROFILES: CanvasProfile[] = [RAW_PROFILE, SYSTEMS_PROFILE, API_PROFILE, DATABASE_PROFILE]

export function profileMetadata(profile: CanvasProfile): CanvasProfileMetadata {
  return {
    profile: profile.id,
    profileVersion: profile.version,
    ...(profile.scope ? { scope: profile.scope } : {}),
  }
}

export function findProfile(
  profiles: readonly CanvasProfile[],
  profileId: string,
): CanvasProfile | undefined {
  return profiles.find((profile) => profile.id === profileId)
}

export function profileEntityTypeIds(profile: CanvasProfile): string[] {
  return [...profile.entityTypes, ...profile.annotationTypes]
}

function ruleMatches(
  profile: CanvasProfile,
  rule: CanvasProfileRelationRule,
  fromEntityType: string,
  toEntityType: string,
): boolean {
  if (!rule.from.includes(fromEntityType)) return false
  if (rule.to.includes('*')) return true
  return rule.to.includes(toEntityType)
}

function findRelationRule(
  profile: CanvasProfile,
  relationType: string,
  fromEntityType: string,
  toEntityType: string,
): CanvasProfileRelationRule | undefined {
  return profile.relationRules.find((rule) => (
    rule.relationType === relationType
    && ruleMatches(profile, rule, fromEntityType, toEntityType)
  ))
}

export function allowedRelationTypes(
  profile: CanvasProfile,
  fromEntityType: string,
  toEntityType: string,
): string[] {
  const relations = profile.relationRules
    .filter((rule) => ruleMatches(profile, rule, fromEntityType, toEntityType))
    .map((rule) => rule.relationType)
  return Array.from(new Set(relations))
}

export function defaultRelationType(
  profile: CanvasProfile,
  fromEntityType: string,
  toEntityType: string,
): string | undefined {
  return allowedRelationTypes(profile, fromEntityType, toEntityType)[0]
}

export function validateProfileRelation(
  profile: CanvasProfile,
  relationType: string,
  fromEntityType: string,
  toEntityType: string,
): ProfileRelationValidation {
  if (!profile.relationTypes.includes(relationType) && !profile.allowUnlistedRelationTypes) {
    return { ok: false, reason: 'unknown_relation' }
  }
  if (profile.allowUnlistedRelationTypes) return { ok: true }
  const rule = findRelationRule(profile, relationType, fromEntityType, toEntityType)
  if (!rule) return { ok: false, reason: 'relation_not_allowed' }
  return { ok: true, rule }
}

export function validateProfileCanvas(
  canvas: Pick<JsonCanvas, 'nodes' | 'edges'> & Partial<Pick<JsonCanvas, 'app'>>,
  profile: CanvasProfile,
  ontology?: Ontology,
): CanvasProfileIssue[] {
  const issues: CanvasProfileIssue[] = []
  const nodes = canvas.nodes ?? []
  const edges = canvas.edges ?? []
  const nodesById = new Map<string, CanvasNode>()
  const entityTypes = new Set(profileEntityTypeIds(profile))

  for (const node of nodes) {
    nodesById.set(node.id, node)
    if (node.type !== 'text') continue
    const entityType = getEntityMeta(node)?.entityType
    if (!entityType) {
      if (!profile.allowUntypedText) {
        issues.push({
          code: 'untyped_text',
          severity: 'warning',
          message: `Text node "${node.id}" has no entity type.`,
          nodeId: node.id,
        })
      }
      continue
    }
    if (!entityTypes.has(entityType) && !profile.allowUnlistedEntityTypes) {
      issues.push({
        code: 'unknown_entity_type',
        severity: 'warning',
        message: `Node "${node.id}" uses entity type "${entityType}" outside the ${profile.label} profile.`,
        nodeId: node.id,
      })
      continue
    }
    if (!ontology) continue
    const definition = findEntityType(ontology, entityType)
    if (!definition) continue
    const fields = getEntityMeta(node)?.fields ?? {}
    for (const field of definition.fields) {
      if (!field.required) continue
      const value = fields[field.key]
      if (value == null || String(value).trim() === '') {
        issues.push({
          code: 'missing_required_field',
          severity: 'warning',
          message: `Node "${node.id}" is missing required field "${field.label}".`,
          nodeId: node.id,
          fieldKey: field.key,
        })
      }
    }
  }

  for (const edge of edges) {
    issues.push(...validateProfileEdge(edge, nodesById, profile))
  }

  if (profile.id === 'systems' && canvasDistrictsEnabled(canvas)) {
    issues.push(...validateZoning(canvas))
  }

  return issues
}

function validateProfileEdge(
  edge: CanvasEdge,
  nodesById: Map<string, CanvasNode>,
  profile: CanvasProfile,
): CanvasProfileIssue[] {
  const issues: CanvasProfileIssue[] = []
  const fromNode = nodesById.get(edge.fromNode)
  const toNode = nodesById.get(edge.toNode)

  if (!fromNode || !toNode) {
    issues.push({
      code: 'missing_endpoint',
      severity: 'warning',
      message: `Edge "${edge.id}" references a missing node.`,
      edgeId: edge.id,
    })
    return issues
  }

  if (fromNode.type === 'group' || toNode.type === 'group') {
    issues.push({
      code: 'group_endpoint',
      severity: 'warning',
      message: `Edge "${edge.id}" connects a group; groups cannot be architecture endpoints.`,
      edgeId: edge.id,
    })
    return issues
  }

  const relationType = getEdgeMeta(edge)?.relationType
  if (!relationType) {
    if (profile.requireRelationType) {
      issues.push({
        code: 'missing_relation_type',
        severity: 'warning',
        message: `Edge "${edge.id}" has no relation type.`,
        edgeId: edge.id,
      })
    }
    return issues
  }

  if (!profile.relationTypes.includes(relationType) && !profile.allowUnlistedRelationTypes) {
    issues.push({
      code: 'unknown_relation_type',
      severity: 'warning',
      message: `Edge "${edge.id}" uses relation type "${relationType}" outside the ${profile.label} profile.`,
      edgeId: edge.id,
    })
    return issues
  }

  const fromEntityType = getEntityMeta(fromNode)?.entityType
  const toEntityType = getEntityMeta(toNode)?.entityType
  if (!fromEntityType || !toEntityType) return issues

  const validation = validateProfileRelation(profile, relationType, fromEntityType, toEntityType)
  if (!validation.ok && validation.reason === 'relation_not_allowed') {
    issues.push({
      code: 'relation_not_allowed',
      severity: 'warning',
      message: `Relation "${relationType}" is not allowed from "${fromEntityType}" to "${toEntityType}".`,
      edgeId: edge.id,
    })
  }

  return issues
}
