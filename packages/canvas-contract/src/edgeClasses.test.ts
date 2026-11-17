import { describe, expect, it } from 'vitest'

import { DEFAULT_ONTOLOGY, type CanvasEdge, type CanvasNode } from './index'
import { edgeClass } from './edgeClasses'

function node(entityType: string): CanvasNode {
  return {
    id: entityType,
    type: 'text',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    text: '',
    app: { entityType, fields: {} },
  } as CanvasNode
}

function edge(relationType?: string): CanvasEdge {
  return {
    id: 'edge',
    fromNode: 'from',
    toNode: 'to',
    ...(relationType ? { app: { relationType } } : {}),
  } as CanvasEdge
}

const EXPECTED_CATEGORIES = {
  flow: [
    'runs',
    'calls',
    'orchestrates',
    'uses',
    'produces',
    'reads_from',
    'writes_to',
    'stores_in',
    'publishes',
    'consumes',
    'emits',
    'handles',
    'carries',
    'depends_on',
  ],
  contract: ['accepts', 'returns', 'describes', 'references'],
  structure: ['contains', 'defines', 'owns', 'implements', 'exposes', 'deploys_to'],
  access: ['authenticates_via'],
  annotation: ['relates_to'],
} as const

describe('edge classes', () => {
  it('gives every ontology relation type one of the contract classes', () => {
    const expected = new Map<string, string>(Object.entries(EXPECTED_CATEGORIES).flatMap(([category, relationTypes]) => (
      relationTypes.map((relationType) => [relationType, category] as const)
    )))
    expect(new Set(DEFAULT_ONTOLOGY.relationTypes.map((relation) => relation.id))).toEqual(new Set(expected.keys()))
    for (const relation of DEFAULT_ONTOLOGY.relationTypes) {
      expect(relation.category, `${relation.id} category`).toBe(expected.get(relation.id))
      expect(edgeClass(edge(relation.id), node('system'), node('system')), relation.id)
        .toBe(expected.get(relation.id))
    }
  })

  it.each([
    { name: 'runtime dependency', relationType: 'runs', source: 'system', target: 'process', expected: 'flow' },
    { name: 'payload link', relationType: 'accepts', source: 'endpoint', target: 'schema', expected: 'contract' },
    { name: 'containment', relationType: 'contains', source: 'resource', target: 'endpoint', expected: 'structure' },
    { name: 'authentication', relationType: 'authenticates_via', source: 'endpoint', target: 'security_scheme', expected: 'access' },
    { name: 'annotation', relationType: 'relates_to', source: 'note', target: 'system', expected: 'annotation' },
    { name: 'no relation type', relationType: undefined, source: 'system', target: 'process', expected: 'unspecified' },
    { name: 'unknown relation type', relationType: 'not_a_relation', source: 'system', target: 'process', expected: 'unspecified' },
    { name: 'uses between cards', relationType: 'uses', source: 'system', target: 'system', expected: 'flow' },
    { name: 'uses a schema target', relationType: 'uses', source: 'system', target: 'schema', expected: 'contract' },
    { name: 'uses a schema source', relationType: 'uses', source: 'schema', target: 'system', expected: 'contract' },
    { name: 'uses between schemas', relationType: 'uses', source: 'schema', target: 'schema', expected: 'contract' },
  ])('$name is $expected', ({ relationType, source, target, expected }) => {
    expect(edgeClass(edge(relationType), node(source), node(target))).toBe(expected)
  })
})
