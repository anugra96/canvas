import { describe, expect, it } from 'vitest'

import { DEFAULT_ONTOLOGY, type CanvasEdge, type CanvasNode, type JsonCanvas } from '@canvas/contract'

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
