import { describe, expect, it } from 'vitest'

import type { CanvasEdge, CanvasNode, JsonCanvas } from './jsonCanvas'
import { DEFAULT_ONTOLOGY, findEntityType, findRelationType } from './ontology'
import {
  DATABASE_PROFILE,
  DEFAULT_PROFILES,
  RAW_PROFILE,
  SYSTEMS_PROFILE,
  API_PROFILE,
  allowedRelationTypes,
  canvasProfileMetadataSchema,
  canvasProfileSchema,
  defaultRelationType,
  findProfile,
  profileEntityTypeIds,
  validateProfileCanvas,
  validateProfileRelation,
} from './profile'

function textNode(
  id: string,
  entityType?: string,
  text = 'Note',
): CanvasNode {
  return {
    id,
    type: 'text',
    x: 0,
    y: 0,
    width: 320,
    height: 200,
    text,
    ...(entityType ? { app: { entityType, fields: {} } } : {}),
  }
}

function groupNode(id: string): CanvasNode {
  return {
    id,
    type: 'group',
    x: 0,
    y: 0,
    width: 500,
    height: 400,
    label: 'Group',
  }
}

function edge(
  id: string,
  fromNode: string,
  toNode: string,
  relationType?: string,
): CanvasEdge {
  return {
    id,
    fromNode,
    toNode,
    ...(relationType ? { app: { relationType } } : {}),
  }
}

describe('canvas profiles', () => {
  it('registers valid Raw and Systems profiles', () => {
    expect(DEFAULT_PROFILES.map((profile) => profile.id)).toEqual(['raw', 'systems', 'api', 'database'])
    expect(findProfile(DEFAULT_PROFILES, 'systems')).toBe(SYSTEMS_PROFILE)
    expect(canvasProfileSchema.safeParse(RAW_PROFILE).success).toBe(true)
    expect(canvasProfileSchema.safeParse(SYSTEMS_PROFILE).success).toBe(true)
    expect(canvasProfileSchema.safeParse(API_PROFILE).success).toBe(true)
    expect(canvasProfileSchema.safeParse(DATABASE_PROFILE).success).toBe(true)
    expect(profileEntityTypeIds(SYSTEMS_PROFILE)).toContain('note')
    expect(profileEntityTypeIds(SYSTEMS_PROFILE)).toContain('schema')
    for (const rule of SYSTEMS_PROFILE.relationRules) {
      expect(SYSTEMS_PROFILE.relationTypes).toContain(rule.relationType)
    }
    expect(new Set(SYSTEMS_PROFILE.relationRules.map((rule) => rule.relationType))).toEqual(
      new Set(SYSTEMS_PROFILE.relationTypes),
    )
    for (const entityTypeId of profileEntityTypeIds(SYSTEMS_PROFILE)) {
      expect(findEntityType(DEFAULT_ONTOLOGY, entityTypeId)).toBeTruthy()
    }
    for (const relationTypeId of SYSTEMS_PROFILE.relationTypes) {
      expect(findRelationType(DEFAULT_ONTOLOGY, relationTypeId)).toBeTruthy()
    }
  })

  it('parses profile metadata and rejects an invalid version', () => {
    expect(canvasProfileMetadataSchema.parse({
      profile: 'systems',
      profileVersion: 1,
      scope: 'container',
    })).toMatchObject({ profile: 'systems', profileVersion: 1 })

    expect(canvasProfileMetadataSchema.safeParse({
      profile: 'systems',
      profileVersion: 0,
    }).success).toBe(false)
  })
})

describe('future profiles', () => {
  it('supports a pipeline profile with route relation rules', () => {
    const pipelineProfile = {
      ...RAW_PROFILE,
      id: 'pipeline',
      label: 'Pipeline',
      scope: 'pipeline',
      allowUntypedText: false,
      allowUnlistedEntityTypes: false,
      allowUnlistedRelationTypes: false,
      requireRelationType: true,
      entityTypes: ['data_source', 'pipeline_step', 'data_sink'],
      annotationTypes: ['note'],
      relationTypes: ['routes_to'],
      relationRules: [
        { relationType: 'routes_to', from: ['data_source', 'pipeline_step'], to: ['pipeline_step', 'data_sink'] },
      ],
    }

    expect(canvasProfileSchema.safeParse(pipelineProfile).success).toBe(true)
    expect(allowedRelationTypes(pipelineProfile, 'data_source', 'pipeline_step')).toEqual(['routes_to'])
    expect(allowedRelationTypes(pipelineProfile, 'pipeline_step', 'data_sink')).toEqual(['routes_to'])
    expect(defaultRelationType(pipelineProfile, 'data_source', 'pipeline_step')).toBe('routes_to')
    expect(allowedRelationTypes(pipelineProfile, 'data_sink', 'pipeline_step')).toEqual([])
  })
})

describe('Systems relation rules', () => {
  it('offers only relations allowed for the source and target types', () => {
    expect(allowedRelationTypes(SYSTEMS_PROFILE, 'system', 'system')).toEqual(['uses'])
    expect(allowedRelationTypes(SYSTEMS_PROFILE, 'actor', 'process')).toEqual(['runs'])
    expect(allowedRelationTypes(SYSTEMS_PROFILE, 'actor', 'system')).toEqual(['uses'])
    expect(allowedRelationTypes(SYSTEMS_PROFILE, 'actor', 'repository')).toEqual(['uses'])
    expect(allowedRelationTypes(SYSTEMS_PROFILE, 'system', 'process')).toEqual(['runs'])
    expect(allowedRelationTypes(SYSTEMS_PROFILE, 'repository', 'process')).toEqual(['runs'])
    expect(allowedRelationTypes(SYSTEMS_PROFILE, 'process', 'system')).toEqual(['uses'])
    expect(allowedRelationTypes(SYSTEMS_PROFILE, 'process', 'process')).toEqual(['runs'])
    expect(allowedRelationTypes(SYSTEMS_PROFILE, 'system', 'artifact')).toEqual(['produces', 'uses'])
    expect(allowedRelationTypes(SYSTEMS_PROFILE, 'system', 'repository')).toEqual(['uses'])
    expect(allowedRelationTypes(SYSTEMS_PROFILE, 'repository', 'artifact')).toEqual(['produces'])
    expect(allowedRelationTypes(SYSTEMS_PROFILE, 'process', 'artifact')).toEqual(['produces', 'uses'])
    expect(allowedRelationTypes(SYSTEMS_PROFILE, 'repository', 'schema')).toEqual(['defines'])
    expect(allowedRelationTypes(SYSTEMS_PROFILE, 'system', 'schema')).toEqual(['uses', 'defines'])
    expect(allowedRelationTypes(SYSTEMS_PROFILE, 'schema', 'system')).toEqual(['describes'])
    expect(allowedRelationTypes(SYSTEMS_PROFILE, 'schema', 'schema')).toEqual(['uses'])
    expect(allowedRelationTypes(SYSTEMS_PROFILE, 'service', 'api')).toEqual([])
  })

  it('selects a deterministic default relation', () => {
    expect(defaultRelationType(SYSTEMS_PROFILE, 'system', 'artifact')).toBe('produces')
    expect(defaultRelationType(SYSTEMS_PROFILE, 'system', 'repository')).toBe('uses')
    expect(defaultRelationType(SYSTEMS_PROFILE, 'repository', 'artifact')).toBe('produces')
    expect(defaultRelationType(SYSTEMS_PROFILE, 'process', 'artifact')).toBe('produces')
    expect(defaultRelationType(SYSTEMS_PROFILE, 'repository', 'process')).toBe('runs')
    expect(defaultRelationType(SYSTEMS_PROFILE, 'repository', 'schema')).toBe('defines')
    expect(defaultRelationType(SYSTEMS_PROFILE, 'schema', 'system')).toBe('describes')
    expect(defaultRelationType(SYSTEMS_PROFILE, 'service', 'api')).toBeUndefined()
  })

  it('rejects invalid pairs and unknown relation types', () => {
    expect(validateProfileRelation(SYSTEMS_PROFILE, 'runs', 'system', 'artifact')).toEqual({
      ok: false,
      reason: 'relation_not_allowed',
    })
    expect(validateProfileRelation(SYSTEMS_PROFILE, 'frobnicates', 'system', 'system')).toEqual({
      ok: false,
      reason: 'unknown_relation',
    })
    expect(validateProfileRelation(SYSTEMS_PROFILE, 'uses', 'system', 'system').ok).toBe(true)
  })

  it('allows annotation links in both directions', () => {
    expect(allowedRelationTypes(SYSTEMS_PROFILE, 'note', 'system')).toEqual(['relates_to'])
    expect(allowedRelationTypes(SYSTEMS_PROFILE, 'note', 'note')).toEqual(['relates_to'])
    expect(allowedRelationTypes(SYSTEMS_PROFILE, 'decision', 'risk')).toEqual(['relates_to'])
    expect(allowedRelationTypes(SYSTEMS_PROFILE, 'system', 'note')).toEqual(['relates_to'])
    expect(allowedRelationTypes(SYSTEMS_PROFILE, 'process', 'decision')).toEqual(['relates_to'])
    expect(allowedRelationTypes(SYSTEMS_PROFILE, 'system', 'system')).not.toContain('relates_to')
  })
})

describe('profile canvas validation', () => {
  it('leaves a freeform Raw canvas unconstrained', () => {
    const canvas: JsonCanvas = {
      nodes: [textNode('text-1')],
      edges: [edge('edge-1', 'text-1', 'text-1')],
    }
    expect(validateProfileCanvas(canvas, RAW_PROFILE)).toEqual([])
    expect(validateProfileRelation(RAW_PROFILE, 'anything', 'one', 'two')).toEqual({ ok: true })
  })

  it('flags missing required fields when ontology is provided', () => {
    const canvas: JsonCanvas = {
      nodes: [textNode('system', 'system')],
      edges: [],
    }
    const issues = validateProfileCanvas(canvas, SYSTEMS_PROFILE, DEFAULT_ONTOLOGY)
    expect(issues).toContainEqual(expect.objectContaining({
      code: 'missing_required_field',
      nodeId: 'system',
      fieldKey: 'name',
    }))
  })

  it('flags untyped text, unknown types, invalid relations, and group endpoints', () => {
    const canvas: JsonCanvas = {
      nodes: [
        textNode('untyped'),
        textNode('unknown', 'service'),
        textNode('system', 'system'),
        textNode('other', 'system'),
        groupNode('group'),
      ],
      edges: [
        edge('invalid', 'system', 'other', 'runs'),
        edge('missing-relation', 'system', 'other'),
        edge('unknown-relation', 'system', 'other', 'frobnicates'),
        edge('group-edge', 'system', 'group', 'uses'),
      ],
    }

    const issues = validateProfileCanvas(canvas, SYSTEMS_PROFILE)
    const codes = issues.map((issue) => issue.code)
    expect(codes).toContain('untyped_text')
    expect(codes).toContain('unknown_entity_type')
    expect(codes).toContain('relation_not_allowed')
    expect(codes).toContain('missing_relation_type')
    expect(codes).toContain('unknown_relation_type')
    expect(codes).toContain('group_endpoint')
  })
})


describe('API profile', () => {
  it('registers API cards and managed relation rules', () => {
    expect(profileEntityTypeIds(API_PROFILE)).toEqual([
      'api_definition',
      'resource',
      'endpoint',
      'security_scheme',
      'schema',
      'note',
      'decision',
      'risk',
    ])
    expect(allowedRelationTypes(API_PROFILE, 'endpoint', 'schema')).toEqual(['accepts', 'returns'])
    expect(allowedRelationTypes(API_PROFILE, 'resource', 'endpoint')).toEqual(['contains'])
    expect(allowedRelationTypes(API_PROFILE, 'api_definition', 'security_scheme')).toEqual([
      'contains',
      'authenticates_via',
    ])
  })
})
