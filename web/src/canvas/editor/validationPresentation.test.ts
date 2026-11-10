import { describe, expect, it } from 'vitest'

import {
  DEFAULT_ONTOLOGY,
  SYSTEMS_PROFILE,
  type CanvasProfileIssue,
} from '@canvas/contract'

import { toFlowEdge, toFlowNode } from '../model/adapter'
import type { PrioritizedValidationIssue } from './prioritizeIssues'
import { buildValidationGroups, safeFixesForGroups } from './validationPresentation'

function node(id: string, entityType: string, name: string) {
  return toFlowNode({
    id,
    type: 'text',
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    text: name,
    app: { entityType, fields: { name } },
  })
}

function issue(edgeId: string): CanvasProfileIssue {
  return {
    code: 'missing_relation_type',
    severity: 'warning',
    message: `Edge "${edgeId}" has no relation type.`,
    edgeId,
  }
}

function entry(value: CanvasProfileIssue): PrioritizedValidationIssue {
  return { issue: value, connections: 2, score: 2_000 }
}

describe('validation presentation', () => {
  it('offers the only legal relation as a safe fix and uses card names', () => {
    const nodes = [node('system', 'system', 'Gateway'), node('other', 'system', 'Orders DB')]
    const edges = [toFlowEdge({ id: 'edge', fromNode: 'system', toNode: 'other', label: 'Define relation' })]
    const groups = buildValidationGroups([entry(issue('edge'))], nodes, edges, SYSTEMS_PROFILE, DEFAULT_ONTOLOGY)

    expect(groups).toHaveLength(1)
    expect(groups[0]?.label).toBe('Missing relation type')
    expect(groups[0]?.issues[0]?.title).toBe('Gateway → Orders DB')
    expect(groups[0]?.safeFixes).toEqual([
      expect.objectContaining({ relationType: 'uses', relationLabel: 'uses' }),
    ])
    expect(safeFixesForGroups(groups)).toHaveLength(1)
  })

  it('requires a choice when several relations are legal', () => {
    const nodes = [node('system', 'system', 'Gateway'), node('artifact', 'artifact', 'Model')]
    const edges = [toFlowEdge({ id: 'edge', fromNode: 'system', toNode: 'artifact', label: 'Define relation' })]
    const groups = buildValidationGroups([entry(issue('edge'))], nodes, edges, SYSTEMS_PROFILE, DEFAULT_ONTOLOGY)

    expect(groups[0]?.issues[0]?.relationRepair?.choices.map((choice) => choice.id)).toEqual([
      'produces',
      'uses',
    ])
    expect(groups[0]?.safeFixes).toEqual([])
  })

  it('treats a matching edge label as a safe fix', () => {
    const nodes = [node('system', 'system', 'Gateway'), node('artifact', 'artifact', 'Model')]
    const edges = [toFlowEdge({ id: 'edge', fromNode: 'system', toNode: 'artifact', label: 'uses' })]
    const groups = buildValidationGroups([entry(issue('edge'))], nodes, edges, SYSTEMS_PROFILE, DEFAULT_ONTOLOGY)

    expect(groups[0]?.safeFixes[0]).toEqual(expect.objectContaining({
      relationType: 'uses',
      reason: 'The edge label matches this relation.',
    }))
  })

  it('offers reversed legal relations for legacy edges with no forward choice', () => {
    const nodes = [node('artifact', 'artifact', 'Image'), node('system', 'system', 'Delivery')]
    const edges = [toFlowEdge({ id: 'edge', fromNode: 'artifact', toNode: 'system' })]
    const groups = buildValidationGroups([entry(issue('edge'))], nodes, edges, SYSTEMS_PROFILE, DEFAULT_ONTOLOGY)

    expect(groups[0]?.issues[0]?.relationRepair?.choices).toEqual([])
    expect(groups[0]?.issues[0]?.relationRepair?.reverseChoices.map((choice) => choice.id)).toEqual([
      'produces',
      'uses',
    ])
  })

  it('groups repeated warnings under one code', () => {
    const nodes = [node('system', 'system', 'Gateway'), node('other', 'system', 'Orders DB')]
    const edges = [
      toFlowEdge({ id: 'one', fromNode: 'system', toNode: 'other', label: 'Define relation' }),
      toFlowEdge({ id: 'two', fromNode: 'system', toNode: 'other', label: 'Define relation' }),
    ]
    const groups = buildValidationGroups(
      [entry(issue('one')), entry(issue('two'))],
      nodes,
      edges,
      SYSTEMS_PROFILE,
      DEFAULT_ONTOLOGY,
    )

    expect(groups).toHaveLength(1)
    expect(groups[0]?.issues).toHaveLength(2)
    expect(groups[0]?.safeFixes).toHaveLength(2)
  })
})
