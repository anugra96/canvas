import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  DEFAULT_ONTOLOGY,
  levelReadiness,
  levelReadinessIssues,
  type CanvasEdge,
  type CanvasNode,
  type JsonCanvas,
  type LevelNumber,
} from '@canvas/contract'

import { toFlowCanvas } from '../model/adapter'
import {
  deriveSequence,
  deriveView,
  recommendedSequenceProcessId,
  sequenceProcessOptions,
} from './derivedViews'

function card(
  id: string,
  entityType: string,
  fields: Record<string, string> = {},
): CanvasNode {
  return {
    id,
    type: 'text',
    x: 0,
    y: 0,
    width: 220,
    height: 120,
    text: `## ${id}`,
    app: {
      entityType,
      fields: { name: id, ...fields },
    },
  } as CanvasNode
}

function relation(id: string, fromNode: string, toNode: string, relationType: string): CanvasEdge {
  return {
    id,
    fromNode,
    toNode,
    app: { relationType },
  } as CanvasEdge
}

function exampleCanvas(filename: string): JsonCanvas {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), `../examples/${filename}`), 'utf8'),
  ) as JsonCanvas
}

const canvas = {
  nodes: [
    card('Release Manager', 'actor', { kind: 'role' }),
    card('Repository', 'repository', { provider: 'github' }),
    card('Deploy', 'process', { mode: 'automated' }),
    card('API', 'system', { kind: 'api' }),
    card('Model', 'artifact', { kind: 'container', version: '2.1.0' }),
    card('OpenAPI', 'schema', { kind: 'api', version: '1.4.0' }),
    card('Delivery note', 'note'),
    {
      id: 'Group',
      type: 'group',
      x: 0,
      y: 0,
      width: 400,
      height: 400,
      label: 'Group',
    },
  ],
  edges: [
    relation('runs-actor', 'Release Manager', 'Deploy', 'runs'),
    relation('runs-repo', 'Repository', 'Deploy', 'runs'),
    relation('uses-api', 'Deploy', 'API', 'uses'),
    relation('produces-model', 'Deploy', 'Model', 'produces'),
    relation('defines-api', 'API', 'OpenAPI', 'defines'),
    relation('describes-api', 'OpenAPI', 'API', 'describes'),
    relation('note-link', 'Deploy', 'Delivery note', 'relates_to'),
  ],
} as JsonCanvas

describe('derived views', () => {
  const flow = toFlowCanvas(canvas, DEFAULT_ONTOLOGY)

  it('projects the same graph into focused read-only views', () => {
    const ids = (viewId: Parameters<typeof deriveView>[2]) => (
      deriveView(flow.nodes, flow.edges, viewId, DEFAULT_ONTOLOGY).nodes.map((node) => node.id).sort()
    )
    const relationIds = (viewId: Parameters<typeof deriveView>[2]) => (
      deriveView(flow.nodes, flow.edges, viewId, DEFAULT_ONTOLOGY).edges.map((edge) => edge.id).sort()
    )

    expect(ids('architecture')).toEqual([
      'API',
      'Deploy',
      'Model',
      'OpenAPI',
      'Release Manager',
      'Repository',
    ])
    expect(ids('runtime')).toEqual(['API', 'Deploy', 'Model', 'Release Manager'])
    expect(ids('data-flow')).toEqual(['API', 'Deploy', 'Model', 'OpenAPI'])
    expect(ids('contracts')).toEqual(['API', 'OpenAPI'])
    expect(ids('pipeline')).toEqual(['API', 'Deploy', 'Model', 'Release Manager', 'Repository'])

    expect(relationIds('runtime')).toEqual(['produces-model', 'runs-actor', 'uses-api'])
    expect(relationIds('contracts')).toEqual(['defines-api', 'describes-api'])
    expect(relationIds('data-flow')).toEqual([
      'defines-api',
      'describes-api',
      'produces-model',
      'uses-api',
    ])
  })

  it('infers a stable process sequence from nearby relations', () => {
    const processes = sequenceProcessOptions(flow.nodes, DEFAULT_ONTOLOGY)
    expect(processes.map((process) => process.id)).toEqual(['Deploy'])
    expect(recommendedSequenceProcessId(flow.nodes, flow.edges, DEFAULT_ONTOLOGY)).toBe('Deploy')

    const sequence = deriveSequence(flow.nodes, flow.edges, 'Deploy', DEFAULT_ONTOLOGY)
    expect(sequence.participants.map((participant) => participant.id)).toEqual([
      'Release Manager',
      'Deploy',
      'API',
      'Repository',
      'Model',
      'OpenAPI',
    ])
    expect(sequence.messages.map((message) => `${message.order}:${message.relationType}`)).toEqual([
      '1:runs',
      '2:runs',
      '3:uses',
      '4:produces',
      '5:defines',
      '6:describes',
    ])
    expect(deriveSequence(flow.nodes, flow.edges, 'Deploy', DEFAULT_ONTOLOGY)).toEqual(sequence)
  })

  it('returns an empty sequence when no process exists', () => {
    const withoutProcess = toFlowCanvas({
      ...canvas,
      nodes: canvas.nodes?.filter((node) => node.id !== 'Deploy'),
      edges: [],
    }, DEFAULT_ONTOLOGY)

    expect(deriveSequence(withoutProcess.nodes, withoutProcess.edges, undefined, DEFAULT_ONTOLOGY)).toEqual({
      processId: '',
      participants: [],
      messages: [],
    })
  })
})

const levelCanvas = {
  nodes: [
    card('Operator', 'actor', { kind: 'role' }),
    card('Platform', 'system', { kind: 'service' }),
    card('Archive', 'system', { kind: 'database' }),
    card('Repo', 'repository', { provider: 'github' }),
    card('Deploy', 'process', { mode: 'automated' }),
    card('Verify', 'process', { mode: 'automated' }),
    card('Model', 'artifact', { kind: 'container' }),
    card('Bundle', 'artifact', { kind: 'dataset', schemaMode: 'shared', schemaRef: 'Manifest' }),
    card('Manifest', 'schema', { kind: 'api', version: '1.0.0' }),
  ],
  edges: [
    relation('operator-deploy', 'Operator', 'Deploy', 'runs'),
    relation('operator-verify', 'Operator', 'Verify', 'runs'),
    relation('operator-repo', 'Operator', 'Repo', 'uses'),
    relation('operator-bundle', 'Operator', 'Bundle', 'uses'),
    relation('platform-deploy', 'Platform', 'Deploy', 'runs'),
    relation('platform-verify', 'Platform', 'Verify', 'runs'),
    relation('platform-repo', 'Platform', 'Repo', 'uses'),
    relation('platform-archive', 'Platform', 'Archive', 'uses'),
    relation('repo-manifest', 'Repo', 'Manifest', 'defines'),
    relation('deploy-model', 'Deploy', 'Model', 'produces'),
    relation('deploy-bundle', 'Deploy', 'Bundle', 'produces'),
    relation('deploy-platform', 'Deploy', 'Platform', 'uses'),
    relation('verify-platform', 'Verify', 'Platform', 'uses'),
  ],
} as JsonCanvas

const orphanCanvas = {
  nodes: [
    card('Standalone', 'repository', { provider: 'local' }),
    card('Loose', 'process', { mode: 'manual' }),
    card('Unclaimed', 'artifact', { kind: 'container' }),
  ],
  edges: [
    relation('loose-standalone', 'Loose', 'Standalone', 'uses'),
    relation('loose-unclaimed', 'Loose', 'Unclaimed', 'produces'),
  ],
} as JsonCanvas

const readinessCanvas = {
  nodes: [
    card('Platform', 'system', { kind: 'service' }),
    card('Standalone', 'repository', { provider: 'local' }),
    card('Loose', 'process', { mode: 'manual' }),
    card('Unclaimed', 'artifact', { kind: 'container' }),
    card('OpenAPI', 'schema', { kind: 'api' }),
  ],
  edges: [],
} as JsonCanvas

const legacyCanvas = {
  nodes: [
    card('Operator', 'actor', { kind: 'role' }),
    card('Platform', 'system', { kind: 'service' }),
    card('Other Platform', 'system', { kind: 'worker' }),
    card('Legacy Service', 'service'),
    card('Legacy API', 'api'),
    card('Vendor', 'external_system'),
    card('Registry Store', 'database'),
    card('Work Queue', 'queue'),
    card('Shared Store', 'database'),
    card('Deployment Ready', 'event'),
    card('Requirement', 'requirement'),
    card('Snippet', 'code'),
    {
      id: 'Untyped',
      type: 'text',
      x: 0,
      y: 0,
      width: 220,
      height: 120,
      text: '## Untyped card',
    },
    card('Decision note', 'note'),
    {
      id: 'Group',
      type: 'group',
      x: 0,
      y: 0,
      width: 400,
      height: 400,
      label: 'Group',
    },
  ],
  edges: [
    relation('platform-registry', 'Platform', 'Registry Store', 'stores_in'),
    relation('platform-queue', 'Platform', 'Work Queue', 'writes_to'),
    relation('platform-event', 'Platform', 'Deployment Ready', 'publishes'),
    relation('platform-shared', 'Platform', 'Shared Store', 'uses'),
    relation('other-shared', 'Other Platform', 'Shared Store', 'reads_from'),
  ],
} as JsonCanvas

interface LevelCase {
  name: string
  canvas: JsonCanvas
  level: LevelNumber
  visible: string[]
  parents: Record<string, string>
  unassigned: string[]
  edges: string[]
  internal: Record<string, number>
  schemaRefEdge?: boolean
  notInLevels?: string[]
}

const levelCases: LevelCase[] = [
  {
    name: 'level 1 folds every deeper card and merges lifted edges',
    canvas: levelCanvas,
    level: 1,
    visible: ['Operator', 'Platform'],
    parents: {
      Deploy: 'Platform',
      Verify: 'Platform',
      Archive: 'Platform',
      Repo: 'Platform',
      Model: 'Deploy',
      Bundle: 'Deploy',
      Manifest: 'Repo',
    },
    unassigned: [],
    edges: [
      'Operator->Platform:runsx2',
      'Operator->Platform:usesx2',
    ],
    internal: { Platform: 10 },
  },
  {
    name: 'level 2 shows containers and folds schemas into their owners',
    canvas: levelCanvas,
    level: 2,
    visible: ['Operator', 'Platform', 'Archive', 'Repo', 'Deploy', 'Verify', 'Model', 'Bundle'],
    parents: {
      Archive: 'Platform',
      Repo: 'Platform',
      Deploy: 'Platform',
      Verify: 'Platform',
      Model: 'Deploy',
      Bundle: 'Deploy',
      Manifest: 'Repo',
    },
    unassigned: [],
    edges: [
      'Bundle->Repo:uses',
      'Deploy->Bundle:produces',
      'Deploy->Model:produces',
      'Deploy->Platform:uses',
      'Operator->Bundle:uses',
      'Operator->Deploy:runs',
      'Operator->Repo:uses',
      'Operator->Verify:runs',
      'Platform->Archive:uses',
      'Platform->Deploy:runs',
      'Platform->Repo:uses',
      'Platform->Verify:runs',
      'Verify->Platform:uses',
    ],
    internal: { Repo: 1 },
  },
  {
    name: 'level 3 is the same as level 2 when there are no component cards',
    canvas: levelCanvas,
    level: 3,
    visible: ['Operator', 'Platform', 'Archive', 'Repo', 'Deploy', 'Verify', 'Model', 'Bundle'],
    parents: {
      Repo: 'Platform',
      Deploy: 'Platform',
      Model: 'Deploy',
      Manifest: 'Repo',
    },
    unassigned: [],
    edges: [
      'Bundle->Repo:uses',
      'Deploy->Bundle:produces',
      'Deploy->Model:produces',
      'Deploy->Platform:uses',
      'Operator->Bundle:uses',
      'Operator->Deploy:runs',
      'Operator->Repo:uses',
      'Operator->Verify:runs',
      'Platform->Archive:uses',
      'Platform->Deploy:runs',
      'Platform->Repo:uses',
      'Platform->Verify:runs',
      'Verify->Platform:uses',
    ],
    internal: { Repo: 1 },
  },
  {
    name: 'level 4 shows schemas and the schemaRef uses edge',
    canvas: levelCanvas,
    level: 4,
    visible: ['Operator', 'Platform', 'Archive', 'Repo', 'Deploy', 'Verify', 'Model', 'Bundle', 'Manifest'],
    parents: {
      Deploy: 'Platform',
      Model: 'Deploy',
      Manifest: 'Repo',
    },
    unassigned: [],
    edges: [
      'Bundle->Manifest:uses',
      'Deploy->Bundle:produces',
      'Deploy->Model:produces',
      'Deploy->Platform:uses',
      'Operator->Bundle:uses',
      'Operator->Deploy:runs',
      'Operator->Repo:uses',
      'Operator->Verify:runs',
      'Platform->Archive:uses',
      'Platform->Deploy:runs',
      'Platform->Repo:uses',
      'Platform->Verify:runs',
      'Repo->Manifest:defines',
      'Verify->Platform:uses',
    ],
    internal: {},
    schemaRefEdge: true,
  },
  {
    name: 'level 1 shows legacy context cards and folds data stores and events',
    canvas: legacyCanvas,
    level: 1,
    visible: [
      'Operator',
      'Platform',
      'Other Platform',
      'Legacy Service',
      'Legacy API',
      'Vendor',
      'Shared Store',
    ],
    parents: {
      'Registry Store': 'Platform',
      'Work Queue': 'Platform',
      'Deployment Ready': 'Platform',
    },
    unassigned: [],
    edges: [
      'Other Platform->Shared Store:reads_from',
      'Platform->Shared Store:uses',
    ],
    internal: { Platform: 3 },
    notInLevels: ['Requirement', 'Snippet', 'Untyped'],
  },
  {
    name: 'level 2 shows legacy data stores with one owning System',
    canvas: legacyCanvas,
    level: 2,
    visible: [
      'Operator',
      'Platform',
      'Other Platform',
      'Legacy Service',
      'Legacy API',
      'Vendor',
      'Shared Store',
      'Registry Store',
      'Work Queue',
    ],
    parents: {
      'Registry Store': 'Platform',
      'Work Queue': 'Platform',
      'Deployment Ready': 'Platform',
    },
    unassigned: [],
    edges: [
      'Other Platform->Shared Store:reads_from',
      'Platform->Registry Store:stores_in',
      'Platform->Shared Store:uses',
      'Platform->Work Queue:writes_to',
    ],
    internal: { Platform: 1 },
    notInLevels: ['Requirement', 'Snippet', 'Untyped'],
  },
  {
    name: 'level 4 shows legacy events under their publisher',
    canvas: legacyCanvas,
    level: 4,
    visible: [
      'Operator',
      'Platform',
      'Other Platform',
      'Legacy Service',
      'Legacy API',
      'Vendor',
      'Shared Store',
      'Registry Store',
      'Work Queue',
      'Deployment Ready',
    ],
    parents: {
      'Registry Store': 'Platform',
      'Work Queue': 'Platform',
      'Deployment Ready': 'Platform',
    },
    unassigned: [],
    edges: [
      'Other Platform->Shared Store:reads_from',
      'Platform->Deployment Ready:publishes',
      'Platform->Registry Store:stores_in',
      'Platform->Shared Store:uses',
      'Platform->Work Queue:writes_to',
    ],
    internal: {},
    notInLevels: ['Requirement', 'Snippet', 'Untyped'],
  },
  {
    name: 'cards without an owner become one Unassigned card',
    canvas: orphanCanvas,
    level: 1,
    visible: [],
    parents: {},
    unassigned: ['Loose', 'Standalone', 'Unclaimed'],
    edges: [],
    internal: { __unassigned__: 2 },
  },
  {
    name: 'unassigned cards become visible at their own level',
    canvas: orphanCanvas,
    level: 2,
    visible: ['Loose', 'Standalone', 'Unclaimed'],
    parents: {},
    unassigned: [],
    edges: [
      'Loose->Standalone:uses',
      'Loose->Unclaimed:produces',
    ],
    internal: {},
  },
]

function levelEdgeKey(edge: { from: string; to: string; relationType?: string; count?: number }): string {
  const count = edge.count && edge.count > 1 ? `x${edge.count}` : ''
  return `${edge.from}->${edge.to}:${edge.relationType ?? ''}${count}`
}

describe('derived view levels', () => {
  it.each(levelCases)('$name', ({ canvas: source, level, visible, parents, unassigned, edges, internal, schemaRefEdge, notInLevels }) => {
    const flow = toFlowCanvas(source, DEFAULT_ONTOLOGY)
    const view = deriveView(flow.nodes, flow.edges, 'architecture', DEFAULT_ONTOLOGY, { level })
    const cards = view.nodes.filter((node) => !node.isUnassigned)

    expect(cards.map((node) => node.id).sort()).toEqual([...visible].sort())
    for (const [id, parent] of Object.entries(parents)) {
      expect(view.levelState?.parents.get(id)).toBe(parent)
    }
    expect(view.levelState?.unassigned).toEqual(unassigned)
    expect(view.edges.map(levelEdgeKey).sort()).toEqual(edges)
    for (const edge of view.edges.filter((candidate) => (candidate.count ?? 1) > 1)) {
      expect(edge.label).toBe(`${edge.label.split(' ×')[0]} ×${edge.count}`)
    }
    for (const [id, count] of Object.entries(internal)) {
      expect(view.nodes.find((node) => node.id === id)?.internalRelations).toBe(count)
    }
    if (schemaRefEdge) {
      expect(view.edges).toContainEqual(expect.objectContaining({
        from: 'Bundle',
        to: 'Manifest',
        relationType: 'uses',
        label: 'uses',
      }))
    }
    const unassignedCard = view.nodes.find((node) => node.isUnassigned)
    if (unassigned.length > 0) {
      expect(unassignedCard?.label).toBe(`Unassigned (${unassigned.length})`)
      expect(unassignedCard?.unassignedItems?.map((item) => item.id)).toEqual(unassigned)
    } else {
      expect(unassignedCard).toBeUndefined()
    }
    if (notInLevels) {
      expect(view.notInLevels.map((item) => item.id).sort()).toEqual([...notInLevels].sort())
    }
  })
})

interface ReadinessCase {
  name: string
  canvas: JsonCanvas
  levels: Array<{
    level: LevelNumber
    available: boolean
    ready: boolean
    unassigned: string[]
  }>
  issues: Record<string, LevelNumber>
}

const readinessCases: ReadinessCase[] = [
  {
    name: 'readiness equals the view for schema-contracts.canvas',
    canvas: exampleCanvas('schema-contracts.canvas'),
    levels: [
      {
        level: 1,
        available: true,
        ready: false,
        unassigned: ['repo-model-delivery', 'schema-deployment-record', 'schema-model-manifest'],
      },
      { level: 2, available: true, ready: true, unassigned: [] },
      { level: 3, available: false, ready: true, unassigned: [] },
      { level: 4, available: true, ready: true, unassigned: [] },
    ],
    issues: {
      'repo-model-delivery': 1,
      'schema-deployment-record': 1,
      'schema-model-manifest': 1,
    },
  },
  {
    name: 'readiness raises one issue per card for model-delivery-migrated.canvas',
    canvas: exampleCanvas('model-delivery-migrated.canvas'),
    levels: [
      {
        level: 1,
        available: true,
        ready: false,
        unassigned: ['schema-cicd-history', 'schema-deployment', 'schema-model-product'],
      },
      {
        level: 2,
        available: true,
        ready: false,
        unassigned: ['schema-cicd-history', 'schema-deployment', 'schema-model-product'],
      },
      {
        level: 3,
        available: false,
        ready: false,
        unassigned: ['schema-cicd-history', 'schema-deployment', 'schema-model-product'],
      },
      { level: 4, available: true, ready: true, unassigned: [] },
    ],
    issues: {
      'schema-cicd-history': 1,
      'schema-deployment': 1,
      'schema-model-product': 1,
    },
  },
  {
    name: 'containers and a parentless schema only count below their own level',
    canvas: readinessCanvas,
    levels: [
      {
        level: 1,
        available: true,
        ready: false,
        unassigned: ['Loose', 'OpenAPI', 'Standalone', 'Unclaimed'],
      },
      {
        level: 2,
        available: true,
        ready: false,
        unassigned: ['OpenAPI'],
      },
      {
        level: 3,
        available: false,
        ready: false,
        unassigned: ['OpenAPI'],
      },
      { level: 4, available: true, ready: true, unassigned: [] },
    ],
    issues: { Loose: 1, OpenAPI: 1, Standalone: 1, Unclaimed: 1 },
  },
]

describe('view readiness', () => {
  it.each(readinessCases)('$name', ({ canvas: source, levels, issues: expectedIssues }) => {
    const nodes = source.nodes ?? []
    const edges = source.edges ?? []
    const readiness = levelReadiness(nodes, edges)
    const flow = toFlowCanvas(source, DEFAULT_ONTOLOGY)

    for (const expected of levels) {
      const entry = readiness.find((candidate) => candidate.level === expected.level)
      expect(entry).toBeDefined()
      expect(entry?.available).toBe(expected.available)
      expect(entry?.ready).toBe(expected.ready)
      expect((entry?.unassigned ?? []).map((card) => card.id).sort()).toEqual([...expected.unassigned].sort())

      const view = deriveView(flow.nodes, flow.edges, 'architecture', DEFAULT_ONTOLOGY, {
        level: expected.level,
      })
      expect([...(view.levelState?.unassigned ?? [])].sort()).toEqual([...expected.unassigned].sort())
    }

    const issues = levelReadinessIssues(readiness)
    expect(issues.map((issue) => `${issue.nodeId}:${issue.fieldKey}`).sort())
      .toEqual(Object.entries(expectedIssues).map(([id, level]) => `${id}:level:${level}`).sort())
    const perCard = new Map<string, number>()
    for (const issue of issues) {
      perCard.set(issue.nodeId!, (perCard.get(issue.nodeId!) ?? 0) + 1)
    }
    expect(Math.max(0, ...perCard.values())).toBeLessThanOrEqual(1)
  })
})
