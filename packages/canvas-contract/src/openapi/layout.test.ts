import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { getEdgeMeta, getEntityMeta, getGroupMembers } from '../ontology'
import { importOpenApi } from './importOpenApi'
import { estimateApiSizes, layoutApiCanvas } from './layout'

const engine = readFileSync(new URL('./fixtures/skyward-engine-v1.json', import.meta.url), 'utf8')
const alaska = readFileSync(new URL('./fixtures/openapi-alaska.yaml', import.meta.url), 'utf8')
const sample = readFileSync(new URL('../../../../examples/simple-tasks-api.yaml', import.meta.url), 'utf8')

function box(node: { x: number; y: number; width: number; height: number }) {
  return { left: node.x, top: node.y, right: node.x + node.width, bottom: node.y + node.height }
}

function overlaps(a: ReturnType<typeof box>, b: ReturnType<typeof box>): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

function typeOf(node: { app?: unknown }): string {
  return getEntityMeta(node)?.entityType ?? ''
}

describe('API layout', () => {
  it.each([
    { name: 'Engine fixture', source: engine },
    { name: 'Alaska fixture', source: alaska },
    { name: 'Simple Tasks sample', source: sample },
  ])('$name is deterministic and readable', ({ source }) => {
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
      expect(Math.abs((target?.y ?? 0) - (source?.y ?? 0))).toBeLessThanOrEqual(80)
      expect(edge.fromEnd).toBe('arrow')
      expect(edge.toEnd).toBe('none')
    }
    for (const edge of (first.edges ?? []).filter((candidate) => getEdgeMeta(candidate)?.relationType === 'uses')) {
      const source = nodes.find((node) => node.id === edge.fromNode)
      const target = nodes.find((node) => node.id === edge.toNode)
      if (!source || !target) continue
      if (Math.abs(source.x - target.x) < 1) expect(source.y).toBeLessThan(target.y)
    }
  })
})
