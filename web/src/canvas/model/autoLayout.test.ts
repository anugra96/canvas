import { describe, expect, it } from 'vitest'

import { toFlowEdge, toFlowNode } from './adapter'
import { autoLayoutCanvas } from './autoLayout'

describe('autoLayoutCanvas', () => {
  it('lays out connected cards without changing edge handles', () => {
    const nodes = [
      toFlowNode({ id: 'a', type: 'text', x: 0, y: 0, width: 240, height: 120, text: 'A' }),
      toFlowNode({ id: 'b', type: 'text', x: 0, y: 0, width: 240, height: 120, text: 'B' }),
    ]
    const edges = [toFlowEdge({ id: 'edge', fromNode: 'a', toNode: 'b' })]
    const result = autoLayoutCanvas(nodes, edges, { direction: 'LR' })
    const a = result.nodes.find((node) => node.id === 'a')
    const b = result.nodes.find((node) => node.id === 'b')
    expect(a && b).toBeTruthy()
    expect(a?.position.x).not.toBe(b?.position.x)
    expect(result.edges[0]).toBe(edges[0])
  })
})

import { describe as describeDataFlow, expect as expectDataFlow, it as itDataFlow } from 'vitest'
import { toFlowEdge as toFlowEdgeDataFlow, toFlowNode as toFlowNodeDataFlow } from './adapter'
import { dataFlowLayoutCanvas } from './autoLayout'

describeDataFlow('dataFlowLayoutCanvas', () => {
  itDataFlow('places described schemas in a contract rail aligned with their target', () => {
    const api = toFlowNodeDataFlow({ id: 'api', type: 'text', x: 0, y: 0, width: 360, height: 240, text: 'API', app: { entityType: 'api', fields: { name: 'Orders API' } } })
    const schema = toFlowNodeDataFlow({ id: 'schema', type: 'text', x: 0, y: 0, width: 520, height: 360, text: 'Schema', app: { entityType: 'schema', fields: { name: 'Order' } } })
    const edge = toFlowEdgeDataFlow({ id: 'describes', fromNode: 'schema', toNode: 'api', app: { relationType: 'describes' } })
    const result = dataFlowLayoutCanvas([api, schema], [edge])
    const layoutApi = result.nodes.find((node) => node.id === 'api')
    const layoutSchema = result.nodes.find((node) => node.id === 'schema')
    expectDataFlow(layoutApi && layoutSchema).toBeTruthy()
    expectDataFlow(layoutSchema!.position.x).toBeGreaterThan(layoutApi!.position.x + 360)
    expectDataFlow(result.edges[0]).toBe(edge)
  })
})
