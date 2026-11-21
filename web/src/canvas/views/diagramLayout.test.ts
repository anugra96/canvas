import { describe, expect, it } from 'vitest'

import {
  DEFAULT_ONTOLOGY,
  type CanvasEdge,
  type CanvasNode,
  type JsonCanvas,
  type LevelNumber,
} from '@canvas/contract'

import { toFlowCanvas } from '../model/adapter'
import { deriveView, type DerivedViewId } from './derivedViews'
import { layoutDerivedView } from './diagramLayout'

function card(
  id: string,
  entityType: string,
  kind: string | undefined,
  x: number,
  y: number,
): CanvasNode {
  return {
    id,
    type: 'text',
    x,
    y,
    width: 240,
    height: 140,
    text: `## ${id}`,
    app: {
      entityType,
      fields: { name: id, ...(kind ? { kind } : {}) },
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

// Canvas geography deliberately runs against the flow direction so dagre cannot pass by accident.
const canvas: JsonCanvas = {
  nodes: [
    card('Operator', 'actor', 'person', 900, 100),
    card('Platform', 'system', 'service', 100, 300),
    card('Deploy', 'system', 'job', 1200, 450),
    card('Model', 'artifact', 'container', 500, 650),
    card('Repo', 'repository', undefined, 1300, 900),
    card('Manifest', 'schema', 'api', 600, 1000),
  ],
  edges: [
    relation('operator-platform', 'Operator', 'Platform', 'uses'),
    relation('platform-deploy', 'Platform', 'Deploy', 'uses'),
    relation('deploy-model', 'Deploy', 'Model', 'produces'),
    relation('repo-manifest', 'Repo', 'Manifest', 'defines'),
  ],
}

interface LayoutCase {
  name: string
  view: DerivedViewId
  level?: LevelNumber
}

const layoutCases: LayoutCase[] = [
  { name: 'architecture', view: 'architecture' },
  { name: 'runtime', view: 'runtime' },
  { name: 'data flow', view: 'data-flow' },
  { name: 'contracts', view: 'contracts' },
  { name: 'pipeline', view: 'pipeline' },
  { name: 'level 1', view: 'architecture', level: 1 },
  { name: 'level 2', view: 'architecture', level: 2 },
]

function overlaps(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
): boolean {
  return left.x < right.x + right.width
    && right.x < left.x + left.width
    && left.y < right.y + right.height
    && right.y < left.y + left.height
}

describe('seeded derived layouts', () => {
  const flow = toFlowCanvas(canvas, DEFAULT_ONTOLOGY)
  const centres = new Map(
    (canvas.nodes ?? []).map((node) => [
      node.id,
      { x: node.x + node.width / 2, y: node.y + node.height / 2 },
    ]),
  )

  it.each(layoutCases)('$name keeps the left-to-right and top-to-bottom canvas order', ({ view, level }) => {
    const derived = deriveView(flow.nodes, flow.edges, view, DEFAULT_ONTOLOGY, { level })
    const diagram = layoutDerivedView(derived, { seed: centres, arrange: 'seeded' })
    const byId = new Map(diagram.nodes.map((node) => [node.id, node]))
    const shared = derived.nodes
      .filter((node) => !node.isUnassigned && centres.has(node.id))
      .map((node) => ({ seeded: centres.get(node.id)!, placed: byId.get(node.id)! }))

    for (let leftIndex = 0; leftIndex < shared.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < shared.length; rightIndex += 1) {
        const left = shared[leftIndex]!
        const right = shared[rightIndex]!
        if (left.seeded.x < right.seeded.x) {
          expect(left.placed.x).toBeLessThanOrEqual(right.placed.x)
        }
        if (left.seeded.y < right.seeded.y) {
          expect(left.placed.y).toBeLessThanOrEqual(right.placed.y)
        }
        expect(overlaps(left.placed, right.placed)).toBe(false)
      }
    }

    const unassigned = diagram.nodes.find((node) => node.isUnassigned)
    if (unassigned) {
      for (const { placed } of shared) {
        expect(unassigned.x).toBeGreaterThanOrEqual(placed.x + placed.width)
        expect(unassigned.y).toBeGreaterThanOrEqual(placed.y + placed.height)
      }
    }

    expect(layoutDerivedView(derived, { seed: centres, arrange: 'seeded' })).toEqual(diagram)
  })

  it('gives a sparse canvas the same compact view as a dense one', () => {
    const derived = deriveView(flow.nodes, flow.edges, 'architecture', DEFAULT_ONTOLOGY)
    const spread = new Map([...centres].map(([id, point]) => [id, { x: point.x * 10, y: point.y * 10 }]))
    const dense = layoutDerivedView(derived, { seed: centres, arrange: 'seeded' })
    const sparse = layoutDerivedView(derived, { seed: spread, arrange: 'seeded' })
    expect(Math.abs(sparse.width - dense.width)).toBeLessThanOrEqual(2)
    expect(Math.abs(sparse.height - dense.height)).toBeLessThanOrEqual(2)
  })

  it('falls back to the dagre layout without two distinct seeds or on auto arrange', () => {
    const derived = deriveView(flow.nodes, flow.edges, 'architecture', DEFAULT_ONTOLOGY)
    const dagre = layoutDerivedView(derived)
    const oneSeed = new Map([['Platform', { x: 10, y: 10 }]])

    expect(layoutDerivedView(derived, { seed: new Map(), arrange: 'seeded' })).toEqual(dagre)
    expect(layoutDerivedView(derived, { seed: oneSeed, arrange: 'seeded' })).toEqual(dagre)
    expect(layoutDerivedView(derived, { seed: centres, arrange: 'auto' })).toEqual(dagre)
  })
})
