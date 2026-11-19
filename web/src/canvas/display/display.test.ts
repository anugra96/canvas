import { describe, expect, it } from 'vitest'

import {
  buildApiReferenceDocument,
  DEFAULT_ONTOLOGY,
  type CanvasEdge,
  type CanvasNode,
} from '@canvas/contract'

import {
  computeDisplay,
  defaultDisplayState,
  selectDisplayPreset,
  toggleDisplayClass,
  toggleDisplayCardType,
  type CanvasDisplayState,
} from './display'

function card(id: string, entityType: string, fields: Record<string, string> = {}): CanvasNode {
  return {
    id,
    type: 'text',
    x: 0,
    y: 0,
    width: 220,
    height: 120,
    text: '',
    app: { entityType, fields: { name: id, ...fields } },
  } as CanvasNode
}

function relation(
  id: string,
  fromNode: string,
  toNode: string,
  relationType?: string,
  fields: Record<string, string> = {},
): CanvasEdge {
  return {
    id,
    fromNode,
    toNode,
    ...(relationType ? { app: { relationType, ...fields } } : {}),
  } as CanvasEdge
}

const systemsNodes: CanvasNode[] = [
  card('system', 'system'),
  card('repository', 'repository'),
  card('job', 'system', { kind: 'job' }),
  card('schema', 'schema'),
  card('note', 'note'),
]

const systemsEdges: CanvasEdge[] = [
  relation('uses-job', 'system', 'job', 'uses'),
  relation('uses-repo', 'system', 'repository', 'uses'),
  relation('defines-repo', 'repository', 'schema', 'defines'),
  relation('defines-system', 'system', 'schema', 'defines'),
  relation('relates', 'note', 'system', 'relates_to'),
  relation('untyped', 'system', 'job'),
]

function drawnIds(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  state: CanvasDisplayState,
  options: { selected?: string[]; revealed?: string[]; api?: boolean } = {},
): string[] {
  return computeDisplay({
    nodes,
    edges,
    state,
    selectedIds: new Set(options.selected ?? []),
    revealedCardIds: new Set(options.revealed ?? []),
    ontology: DEFAULT_ONTOLOGY,
    apiReference: options.api ? buildApiReferenceDocument(nodes) : null,
  }).edges.map((edge) => edge.id).sort()
}

describe('display drawing', () => {
  it.each([
    {
      name: 'Systems Standard draws flow and unspecified edges',
      state: defaultDisplayState('systems'),
      drawn: ['untyped', 'uses-job', 'uses-repo'],
      hiddenCards: 0,
      hiddenEdges: 3,
    },
    {
      name: 'Systems Minimal draws flow and unspecified edges',
      state: selectDisplayPreset(defaultDisplayState('systems'), 'minimal'),
      drawn: ['untyped', 'uses-job', 'uses-repo'],
      hiddenCards: 0,
      hiddenEdges: 3,
    },
    {
      name: 'Systems All draws every edge',
      state: selectDisplayPreset(defaultDisplayState('systems'), 'all'),
      drawn: ['defines-repo', 'defines-system', 'relates', 'untyped', 'uses-job', 'uses-repo'],
      hiddenCards: 0,
      hiddenEdges: 0,
    },
    {
      name: 'Systems custom classes filter each class',
      state: toggleDisplayClass(
        toggleDisplayClass(defaultDisplayState('systems'), 'contract'),
        'structure',
      ),
      drawn: ['defines-repo', 'defines-system', 'untyped', 'uses-job', 'uses-repo'],
      hiddenCards: 0,
      hiddenEdges: 1,
    },
    {
      name: 'selection reveals every edge of the selected card',
      state: selectDisplayPreset(defaultDisplayState('systems'), 'minimal'),
      selected: ['system'],
      drawn: ['defines-system', 'relates', 'untyped', 'uses-job', 'uses-repo'],
      hiddenCards: 0,
      hiddenEdges: 1,
    },
    {
      name: 'hidden card types hide their cards and edges',
      state: toggleDisplayCardType(defaultDisplayState('systems'), 'schema'),
      drawn: ['untyped', 'uses-job', 'uses-repo'],
      hiddenCards: 1,
      hiddenEdges: 3,
    },
    {
      name: 'a Review reveal shows a hidden card without changing the stored choice',
      state: toggleDisplayCardType(defaultDisplayState('systems'), 'schema'),
      revealed: ['schema'],
      drawn: ['untyped', 'uses-job', 'uses-repo'],
      hiddenCards: 0,
      hiddenEdges: 3,
    },
    {
      name: 'API Standard still applies API edge rules',
      state: defaultDisplayState('api'),
      api: true,
      drawn: ['accepts', 'auth-override', 'manual', 'returns-200', 'uses-next'],
      hiddenCards: 0,
      hiddenEdges: 7,
    },
    {
      name: 'API Minimal draws only unspecified edges',
      state: selectDisplayPreset(defaultDisplayState('api'), 'minimal'),
      api: true,
      drawn: ['manual'],
      hiddenCards: 0,
      hiddenEdges: 11,
    },
    {
      name: 'API All draws every edge',
      state: selectDisplayPreset(defaultDisplayState('api'), 'all'),
      api: true,
      drawn: [
        'accepts',
        'auth-api',
        'auth-inherited',
        'auth-override',
        'contains-api',
        'contains-resource',
        'manual',
        'relates',
        'returns-200',
        'returns-404',
        'uses-next',
        'uses-same',
      ],
      hiddenCards: 0,
      hiddenEdges: 0,
    },
    {
      name: 'API custom classes still use API edge rules',
      state: toggleDisplayClass(selectDisplayPreset(defaultDisplayState('api'), 'all'), 'annotation'),
      api: true,
      drawn: ['accepts', 'auth-override', 'manual', 'returns-200', 'uses-next'],
      hiddenCards: 0,
      hiddenEdges: 7,
    },
  ])('$name', ({ state, drawn, hiddenCards, hiddenEdges, selected, revealed, api }) => {
    const result = computeDisplay({
      nodes: api ? apiNodes : systemsNodes,
      edges: api ? apiEdges : systemsEdges,
      state,
      selectedIds: new Set(selected ?? []),
      revealedCardIds: new Set(revealed ?? []),
      ontology: DEFAULT_ONTOLOGY,
      apiReference: api ? buildApiReferenceDocument(apiNodes) : null,
    })
    expect(result.edges.map((edge) => edge.id).sort()).toEqual(drawn)
    expect(result.hiddenCards).toBe(hiddenCards)
    expect(result.hiddenEdges).toBe(hiddenEdges)
  })

  it('keeps unspecified edges drawn in every preset', () => {
    for (const preset of ['minimal', 'standard', 'all'] as const) {
      expect(drawnIds(systemsNodes, systemsEdges, selectDisplayPreset(defaultDisplayState('systems'), preset)))
        .toContain('untyped')
    }
  })
})

const apiNodes: CanvasNode[] = [
  card('api', 'api_definition', {
    title: 'Things API',
    version: '1.0.0',
    extra: JSON.stringify({ security: [{ BearerAuth: [] }] }),
  }),
  card('resource', 'resource', { name: 'Things' }),
  card('endpoint', 'endpoint', {
    method: 'POST',
    path: '/things',
    operation: JSON.stringify({
      tags: ['Things'],
      security: [],
      requestBody: {
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/ThingCreate' } },
        },
      },
      responses: {
        '200': {
          description: 'ok',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/OkModel' } },
          },
        },
        '404': {
          description: 'missing',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrModel' } },
          },
        },
      },
    }),
  }),
  card('endpoint-inherited', 'endpoint', {
    method: 'GET',
    path: '/things/{thing_id}',
    operation: JSON.stringify({ tags: ['Things'], responses: { '204': { description: 'ok' } } }),
  }),
  card('security', 'security_scheme'),
  card('thing-create', 'schema', {
    name: 'ThingCreate',
    source: JSON.stringify({
      type: 'object',
      properties: { base: { $ref: '#/components/schemas/ThingBase' } },
    }),
  }),
  card('thing-base', 'schema', { name: 'ThingBase', source: '{}' }),
  card('ok-model', 'schema', { name: 'OkModel', source: '{}' }),
  card('err-model', 'schema', { name: 'ErrModel', source: '{}' }),
  card('note', 'note'),
]

const apiEdges: CanvasEdge[] = [
  relation('contains-api', 'api', 'resource', 'contains'),
  relation('contains-resource', 'resource', 'endpoint', 'contains'),
  relation('accepts', 'endpoint', 'thing-create', 'accepts'),
  relation('returns-200', 'endpoint', 'ok-model', 'returns', { status: '200' }),
  relation('returns-404', 'endpoint', 'err-model', 'returns', { status: '404' }),
  relation('auth-api', 'api', 'security', 'authenticates_via'),
  relation('auth-inherited', 'endpoint-inherited', 'security', 'authenticates_via'),
  relation('auth-override', 'endpoint', 'security', 'authenticates_via'),
  relation('uses-next', 'thing-create', 'thing-base', 'uses'),
  relation('uses-same', 'thing-create', 'ok-model', 'uses'),
  relation('relates', 'note', 'endpoint', 'relates_to'),
  relation('manual', 'endpoint', 'note'),
]
