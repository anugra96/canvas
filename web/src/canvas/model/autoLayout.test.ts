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
