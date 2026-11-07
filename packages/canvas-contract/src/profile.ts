import { z } from 'zod'

import type { CanvasEdge, CanvasNode, JsonCanvas } from './jsonCanvas'
import {
  findEntityType,
  getEdgeMeta,
  getEntityMeta,
  type Ontology,
} from './ontology'

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
  })
  .passthrough()

export type CanvasProfileRelationRule = z.infer<typeof canvasProfileRelationRuleSchema>
export type CanvasProfile = z.infer<typeof canvasProfileSchema>
export type CanvasProfileMetadata = z.infer<typeof canvasProfileMetadataSchema>

export type ProfileRelationValidation =
  | { ok: true; rule?: CanvasProfileRelationRule }
  | { ok: false; reason: 'unknown_relation' | 'relation_not_allowed' }

export type ProfileIssueCode =
  | 'untyped_text'
  | 'unknown_entity_type'
  | 'missing_required_field'
  | 'missing_relation_type'
  | 'unknown_relation_type'
  | 'relation_not_allowed'
  | 'group_endpoint'
  | 'missing_endpoint'

export interface CanvasProfileIssue {
  code: ProfileIssueCode
  severity: 'warning'
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
  version: 2,
  description: 'Minimal systems design and architecture review.',
  scope: 'container',
  allowUntypedText: false,
  allowUnlistedEntityTypes: false,
  allowUnlistedRelationTypes: false,
  requireRelationType: true,
  entityTypes: ['system', 'repository', 'api', 'database', 'actor', 'process', 'artifact'],
  annotationTypes: ['note', 'decision', 'risk'],
  relationTypes: [
    'exposes',
    'calls',
    'stores_in',
    'depends_on',
    'runs',
    'orchestrates',
    'produces',
    'uses',
    'relates_to',
  ],
  relationRules: [
    { relationType: 'exposes', from: ['system'], to: ['api'] },
    { relationType: 'calls', from: ['system'], to: ['api'] },
    { relationType: 'stores_in', from: ['system'], to: ['database'] },
    { relationType: 'depends_on', from: ['system'], to: ['system'] },
    { relationType: 'runs', from: ['actor', 'system'], to: ['process'] },
    { relationType: 'orchestrates', from: ['process'], to: ['system', 'api', 'database'] },
    { relationType: 'produces', from: ['system', 'repository'], to: ['artifact'] },
    { relationType: 'uses', from: ['system', 'process'], to: ['artifact'] },
    { relationType: 'uses', from: ['system'], to: ['repository'] },
    { relationType: 'uses', from: ['actor'], to: ['system'] },
    { relationType: 'relates_to', from: ['note', 'decision', 'risk'], to: ['*'] },
    {
      relationType: 'relates_to',
      from: ['system', 'repository', 'api', 'database', 'actor', 'process', 'artifact'],
      to: ['note', 'decision', 'risk'],
    },
  ],
}
export const DEFAULT_PROFILES: CanvasProfile[] = [RAW_PROFILE, SYSTEMS_PROFILE]

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
  canvas: Pick<JsonCanvas, 'nodes' | 'edges'>,
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
