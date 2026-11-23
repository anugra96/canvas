import { readFileSync, readdirSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  SYSTEMS_PROFILE,
  ZONING_ISSUE_CODES,
  districtOf,
  groupParents,
  planLayout,
  validateProfileCanvas,
  withCanvasDistricts,
  type CanvasEdge,
  type CanvasNode,
  type JsonCanvas,
  type LayoutPlan,
  type ProfileIssueCode,
} from './index'

function textNode(
  id: string,
  entityType: string,
  fields: Record<string, string | number | null>,
  x: number,
  y: number,
  width = 320,
  height = 200,
): CanvasNode {
  return {
    id,
    type: 'text',
    x,
    y,
    width,
    height,
    text: id,
    app: { entityType, fields },
  } as CanvasNode
}

function system(
  id: string,
  kind: string,
  name = id,
  x = 0,
  y = 0,
  width = 320,
  height = 200,
): CanvasNode {
  return textNode(id, 'system', { name, kind }, x, y, width, height)
}

function actor(id: string, name: string, x = 0, y = 0): CanvasNode {
  return textNode(id, 'actor', { name, kind: 'team' }, x, y)
}

function group(
  id: string,
  label: string,
  rect: { x: number; y: number; width: number; height: number },
  district?: { ownerId?: string },
): CanvasNode {
  return {
    id,
    type: 'group',
    ...rect,
    label,
    app: district ? { district } : undefined,
  } as CanvasNode
}

function uses(id: string, fromNode: string, toNode: string): CanvasEdge {
  return {
    id,
    fromNode,
    toNode,
    app: { relationType: 'uses' },
  } as CanvasEdge
}

function zoningIssues(canvas: Pick<JsonCanvas, 'nodes' | 'edges'> & Partial<Pick<JsonCanvas, 'app'>>) {
  const zoning = new Set<ProfileIssueCode>(ZONING_ISSUE_CODES)
  return validateProfileCanvas(canvas, SYSTEMS_PROFILE)
    .filter((issue) => zoning.has(issue.code))
    .map((issue) => ({
      code: issue.code,
      nodeId: issue.nodeId,
      ...(issue.edgeId ? { edgeId: issue.edgeId } : {}),
    }))
    .sort((left, right) => (
      left.code.localeCompare(right.code)
      || (left.nodeId ?? '').localeCompare(right.nodeId ?? '')
      || (left.edgeId ?? '').localeCompare(right.edgeId ?? '')
    ))
}

function districtCanvas(): JsonCanvas {
  return {
    nodes: [
      group('payments', 'Payments', { x: 0, y: 0, width: 900, height: 700 }, { ownerId: 'owner' }),
      group('finance', 'Finance', { x: 1000, y: 0, width: 900, height: 700 }, {}),
      actor('owner', 'Finance team', 40, 60),
      system('orders', 'service', 'Orders service', 420, 60, 380, 260),
      system('db', 'database', 'Ledger DB', 40, 340, 380, 260),
      system('queue', 'queue', 'Events queue', 420, 340, 380, 260),
      system('billing', 'service', 'Billing service', 1040, 60, 380, 260),
      system('ledgerApi', 'api', 'Ledger API', 1420, 60, 380, 260),
      system('lonely', 'service', 'Lonely service', 2200, 400),
      system('vendor', 'external', 'Payment vendor', 2200, 0),
    ],
    edges: [
      uses('same-orders-db', 'orders', 'db'),
      uses('cross-billing-db', 'billing', 'db'),
      uses('same-orders-queue', 'orders', 'queue'),
      uses('cross-billing-queue', 'billing', 'queue'),
      uses('cross-orders-billing', 'orders', 'billing'),
      uses('cross-orders-ledger-api', 'orders', 'ledgerApi'),
      uses('cross-orders-vendor', 'orders', 'vendor'),
    ],
  }
}

function appliedNodes(canvas: JsonCanvas, plan: LayoutPlan): CanvasNode[] {
  const nodes = (canvas.nodes ?? []).map((node) => ({ ...node }))
  const byId = new Map(nodes.map((node) => [node.id, node]))
  for (const move of plan.moves) {
    const node = byId.get(move.id)
    if (node) {
      node.x = move.to.x
      node.y = move.to.y
    }
  }
  for (const resize of plan.groupResizes) {
    const node = byId.get(resize.id)
    if (!node) continue
    node.x = resize.x
    node.y = resize.y
    node.width = resize.width
    node.height = resize.height
  }
  return nodes
}

describe('zoning rules', () => {
  const expected = [
    { code: 'district_without_owner', nodeId: 'finance' },
    { code: 'route_bypasses_gate', nodeId: 'billing', edgeId: 'cross-orders-billing' },
    { code: 'route_bypasses_gate', nodeId: 'db', edgeId: 'cross-billing-db' },
    { code: 'shared_landmark', nodeId: 'db' },
    { code: 'unzoned_card', nodeId: 'lonely' },
  ]

  it('reports exactly the zoning issues on a canvas with districts', () => {
    expect(zoningIssues(districtCanvas())).toEqual(expected)
  })

  it('stays quiet when the same canvas has no district flags', () => {
    const canvas = districtCanvas()
    const plain = {
      ...canvas,
      nodes: (canvas.nodes ?? []).map((node) => (
        node.type === 'group' ? { ...node, app: undefined } as CanvasNode : node
      )),
    }
    expect(zoningIssues(plain)).toEqual([])
  })

  it('stays quiet when the canvas turns districts off, and reports again when turned back on', () => {
    const canvas = { ...districtCanvas(), app: { profile: 'systems', profileVersion: 5 } } as JsonCanvas
    const off = withCanvasDistricts(canvas, false)
    expect(off.app?.districts).toBe(false)
    expect(zoningIssues(off)).toEqual([])
    expect(zoningIssues(withCanvasDistricts(off, true))).toEqual(expected)
  })
})

describe('district membership', () => {
  it('agrees with the planner for a raw group with an overflowing card', () => {
    const canvas: JsonCanvas = {
      nodes: [
        group('g', 'Payments', { x: 0, y: 0, width: 200, height: 400 }, {}),
        textNode('a', 'system', { name: 'A', kind: 'service' }, 40, 60, 120, 60),
        textNode('wide', 'system', { name: 'Wide', kind: 'service' }, 40, 200, 260, 60),
        textNode('out', 'system', { name: 'Out', kind: 'service' }, 600, 0, 120, 60),
      ],
      edges: [uses('a-wide', 'a', 'wide')],
    }

    expect(groupParents(canvas).get('wide')).toBe('g')
    const before = districtOf(canvas)
    expect([...before.entries()].sort()).toEqual([['a', 'g'], ['wide', 'g']])

    const plan = planLayout(canvas, { kind: 'replan' })
    const after = districtOf({ ...canvas, nodes: appliedNodes(canvas, plan) })
    expect([...after.entries()].sort()).toEqual([...before.entries()].sort())
  })
})

describe('example canvases', () => {
  it('keeps every Systems example free of zoning issues', () => {
    const examplesDir = new URL('../../../examples/', import.meta.url)
    const systems = readdirSync(examplesDir)
      .filter((file) => file.endsWith('.canvas'))
      .flatMap((file) => {
        const canvas = JSON.parse(readFileSync(new URL(file, examplesDir), 'utf8')) as JsonCanvas
        return canvas.app?.profile === 'systems' ? [{ file, canvas }] : []
      })

    expect(systems.length).toBeGreaterThan(0)
    for (const { file, canvas } of systems) {
      expect((canvas.nodes ?? []).some((node) => (
        node.type === 'group' && node.app && 'district' in node.app
      )), file).toBe(false)
      expect(zoningIssues({
        nodes: canvas.nodes ?? [],
        edges: canvas.edges ?? [],
      }), file).toEqual([])
    }
  })
})
