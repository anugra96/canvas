import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { getEdgeMeta, getEntityMeta, getGroupMembers } from '../ontology'
import { importOpenApi } from './importOpenApi'
import { estimateApiSizes, layoutApiCanvas } from './layout'
import { shouldDrawApiEdge } from './edgeVisibility'
import { buildApiReferenceDocument } from './reference'

const engine = readFileSync(new URL('./fixtures/skyward-engine-v1.json', import.meta.url), 'utf8')
const alaska = readFileSync(new URL('./fixtures/openapi-alaska.yaml', import.meta.url), 'utf8')
const sample = readFileSync(new URL('../../../../examples/simple-tasks-api.yaml', import.meta.url), 'utf8')
const registry = readFileSync(new URL('./fixtures/registry-v0.json', import.meta.url), 'utf8')

function box(node: { x: number; y: number; width: number; height: number }) {
  return { left: node.x, top: node.y, right: node.x + node.width, bottom: node.y + node.height }
}

function overlaps(a: ReturnType<typeof box>, b: ReturnType<typeof box>): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

function typeOf(node: { app?: unknown }): string {
  return getEntityMeta(node)?.entityType ?? ''
}



function segmentIntersectsBox(
  from: { x: number; y: number },
  to: { x: number; y: number },
  rect: { left: number; top: number; right: number; bottom: number },
  inset = 0.5,
): boolean {
  const left = rect.left + inset
  const right = rect.right - inset
  const top = rect.top + inset
  const bottom = rect.bottom - inset
  if (right <= left || bottom <= top) return false
  const dx = to.x - from.x
  const dy = to.y - from.y
  let start = 0
  let end = 1
  const checks: Array<[number, number]> = [
    [-dx, from.x - left],
    [dx, right - from.x],
    [-dy, from.y - top],
    [dy, bottom - from.y],
  ]
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return false
      continue
    }
    const ratio = q / p
    if (p < 0) start = Math.max(start, ratio)
    else end = Math.min(end, ratio)
    if (start > end) return false
  }
  return true
}

function handlePoint(node: { x: number; y: number; width: number; height: number }, side: string) {
  if (side === 'left') return { x: node.x, y: node.y + node.height / 2 }
  if (side === 'right') return { x: node.x + node.width, y: node.y + node.height / 2 }
  if (side === 'top') return { x: node.x + node.width / 2, y: node.y }
  return { x: node.x + node.width / 2, y: node.y + node.height }
}

describe('API layout', () => {
  it.each([
    { name: 'Engine fixture', source: engine, checkEdges: false, tightAccepts: true },
    { name: 'Alaska fixture', source: alaska, checkEdges: false, tightAccepts: true },
    { name: 'Simple Tasks sample', source: sample, checkEdges: false, tightAccepts: true },
    { name: 'Registry fixture', source: registry, checkEdges: true, tightAccepts: false },
  ])('$name is deterministic and readable', ({ source, checkEdges, tightAccepts }) => {
    const imported = importOpenApi(source).canvas
    const sizes = estimateApiSizes(imported)
    const sizeSnapshot = JSON.stringify(sizes)
    const first = layoutApiCanvas(imported, sizes)
    expect(JSON.stringify(sizes)).toBe(sizeSnapshot)
    const second = layoutApiCanvas(first, estimateApiSizes(first))
    expect((second.nodes ?? []).map((node) => [node.id, node.x, node.y, node.width, node.height]))
      .toEqual((first.nodes ?? []).map((node) => [node.id, node.x, node.y, node.width, node.height]))

    const nodes = first.nodes ?? []
    const resources = nodes.filter((node) => typeOf(node) === 'resource')
    const endpoints = nodes.filter((node) => typeOf(node) === 'endpoint')
    const lanes = resources.map((resource) => ({
      id: resource.id,
      box: box(resource),
      members: new Set(getGroupMembers(resource) ?? []),
    }))

    for (const endpoint of endpoints) {
      const lane = lanes.find((candidate) => candidate.members.has(endpoint.id))
      expect(lane, `endpoint ${endpoint.id} has a lane`).toBeTruthy()
      const endpointBox = box(endpoint)
      expect(endpointBox.left).toBeGreaterThanOrEqual(lane!.box.left)
      expect(endpointBox.top).toBeGreaterThanOrEqual(lane!.box.top)
      expect(endpointBox.right).toBeLessThanOrEqual(lane!.box.right)
      expect(endpointBox.bottom).toBeLessThanOrEqual(lane!.box.bottom)
    }

    const rectangles = nodes.map((node) => ({ id: node.id, type: typeOf(node), box: box(node) }))
    for (let leftIndex = 0; leftIndex < rectangles.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < rectangles.length; rightIndex += 1) {
        const left = rectangles[leftIndex]!
        const right = rectangles[rightIndex]!
        if (left.type === 'resource' || right.type === 'resource') {
          const lane = left.type === 'resource' ? left : right
          const other = left.type === 'resource' ? right : left
          const members = new Set(getGroupMembers(nodes.find((node) => node.id === lane.id)!) ?? [])
          if (members.has(other.id)) continue
        }
        expect(overlaps(left.box, right.box), `${left.id} overlaps ${right.id}`).toBe(false)
      }
    }

    const accepts = (first.edges ?? []).filter((edge) => getEdgeMeta(edge)?.relationType === 'accepts')
    const returns = (first.edges ?? []).filter((edge) => getEdgeMeta(edge)?.relationType === 'returns' && /^[123]/.test(getEdgeMeta(edge)?.status ?? ''))
    const requestNames = new Set(accepts.map((edge) => nodes.find((node) => node.id === edge.toNode)).filter(Boolean).map((node) => String(getEntityMeta(node!)?.fields.name)))
    const responseNames = new Set(returns.map((edge) => nodes.find((node) => node.id === edge.toNode)).filter(Boolean).map((node) => String(getEntityMeta(node!)?.fields.name)))
    const requestNodes = nodes.filter((node) => typeOf(node) === 'schema' && requestNames.has(String(getEntityMeta(node)?.fields.name)) && !responseNames.has(String(getEntityMeta(node)?.fields.name)))
    const responseNodes = nodes.filter((node) => typeOf(node) === 'schema' && responseNames.has(String(getEntityMeta(node)?.fields.name)))
    const laneLeft = Math.min(...lanes.map((lane) => lane.box.left))
    const laneRight = Math.max(...lanes.map((lane) => lane.box.right))
    for (const model of requestNodes) expect(model.x, `${model.id} is left of lanes`).toBeLessThan(laneLeft)
    for (const model of responseNodes) expect(model.x, `${model.id} is right of lanes`).toBeGreaterThan(laneRight)
    for (const edge of returns) {
      const source = nodes.find((node) => node.id === edge.fromNode)
      const target = nodes.find((node) => node.id === edge.toNode)
      expect(source?.x ?? 0).toBeLessThan(target?.x ?? 0)
    }
    for (const edge of accepts) {
      const source = nodes.find((node) => node.id === edge.fromNode)
      const target = nodes.find((node) => node.id === edge.toNode)
      expect(target?.x ?? 0).toBeLessThan(source?.x ?? 0)
      if (tightAccepts) expect(Math.abs((target?.y ?? 0) - (source?.y ?? 0))).toBeLessThanOrEqual(80)
      expect(edge.fromEnd).toBe('arrow')
      expect(edge.toEnd).toBe('none')
    }
    for (const edge of (first.edges ?? []).filter((candidate) => getEdgeMeta(candidate)?.relationType === 'uses')) {
      const source = nodes.find((node) => node.id === edge.fromNode)
      const target = nodes.find((node) => node.id === edge.toNode)
      if (!source || !target) continue
      if (!checkEdges && Math.abs(source.x - target.x) < 1) expect(source.y).toBeLessThan(target.y)
    }

    if (checkEdges) {
      const reference = buildApiReferenceDocument(nodes)
      const endpointById = new Map(reference.resources.flatMap((resource) => (
        resource.endpoints.map((endpoint) => [endpoint.id, endpoint] as const)
      )))
      const modelNames = new Map(nodes.map((node) => [node.id, String(getEntityMeta(node)?.fields.name ?? '')]))
      const cards = rectangles.filter((item) => item.type !== 'resource' && item.type !== 'group')
      const byId = new Map(nodes.map((node) => [node.id, node]))
      const drawn = (first.edges ?? []).filter((edge) => {
        const meta = getEdgeMeta(edge)
        const sourcePlacement = reference.modelPlacement[modelNames.get(edge.fromNode) ?? '']
        const targetPlacement = reference.modelPlacement[modelNames.get(edge.toNode) ?? '']
        return shouldDrawApiEdge({
          relationType: meta?.relationType,
          status: meta?.status ?? edge.label,
          sourceType: typeOf(byId.get(edge.fromNode) ?? {}),
          securityOverride: endpointById.get(edge.fromNode)?.securityOverride,
          usesNextColumn: Boolean(sourcePlacement
            && targetPlacement
            && sourcePlacement.region === targetPlacement.region
            && sourcePlacement.region !== 'shared'
            && targetPlacement.depth === sourcePlacement.depth + 1),
          usesShared: targetPlacement?.region === 'shared',
        })
      })
      for (const edge of drawn) {
        const source = byId.get(edge.fromNode)
        const target = byId.get(edge.toNode)
        if (!source || !target) continue
        let fromSide = edge.fromSide
        let toSide = edge.toSide
        if (!fromSide || !toSide) {
          if (Math.abs(source.x - target.x) < 1) {
            fromSide = source.y < target.y ? 'bottom' : 'top'
            toSide = source.y < target.y ? 'top' : 'bottom'
          } else {
            fromSide = target.x > source.x ? 'right' : 'left'
            toSide = target.x > source.x ? 'left' : 'right'
          }
        }
        const from = handlePoint(source, fromSide)
        const to = handlePoint(target, toSide)
        for (const card of cards) {
          if (card.id === source.id || card.id === target.id) continue
          expect(
            segmentIntersectsBox(from, to, card.box),
            `${edge.fromNode} -> ${edge.toNode} crosses ${card.id}`,
          ).toBe(false)
        }
      }
    }
  })
})
