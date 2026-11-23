import { describe, expect, it } from 'vitest'

import type { JsonCanvas } from '@canvas/contract'

import { cardBackgroundFor, fromFlowCanvas, toFlowCanvas, toFlowNode } from './adapter'

const source: JsonCanvas = {
  nodes: [
    {
      id: 'card-a',
      type: 'text',
      x: 10,
      y: 20,
      width: 320,
      height: 180,
      text: 'Hello',
      color: '4',
      styleAttributes: { align: 'center' },
    },
    {
      id: 'group-a',
      type: 'group',
      x: -20,
      y: -20,
      width: 420,
      height: 260,
      label: 'Group',
    },
  ],
  edges: [
    {
      id: 'edge-a',
      fromNode: 'card-a',
      fromSide: 'right',
      toNode: 'group-a',
      toSide: 'left',
      label: 'contains',
      toFloating: true,
    },
  ],
  metadata: { version: '1.0-1.0' },
}

describe('canvas flow adapter', () => {
  it('round-trips positions, dimensions, text, sides, labels, and unknown fields', () => {
    const flow = toFlowCanvas(source)
    const roundTrip = fromFlowCanvas(flow.nodes, flow.edges, source)

    expect(roundTrip.nodes?.[0]).toMatchObject({
      id: 'card-a',
      x: 10,
      y: 20,
      width: 320,
      height: 180,
      text: 'Hello',
      color: '4',
      styleAttributes: { align: 'center' },
    })
    expect(roundTrip.edges?.[0]).toMatchObject({
      id: 'edge-a',
      fromNode: 'card-a',
      fromSide: 'right',
      toNode: 'group-a',
      toSide: 'left',
      label: 'contains',
      toFloating: true,
    })
    expect(roundTrip.metadata).toEqual({ version: '1.0-1.0' })
  })

  it('serializes a moved and resized node', () => {
    const flow = toFlowCanvas(source)
    const card = flow.nodes[0]!
    card.position = { x: 80, y: 120 }
    card.style = { ...card.style, width: 400, height: 220 }
    card.data = { ...card.data, text: 'Edited' }

    const roundTrip = fromFlowCanvas(flow.nodes, flow.edges, source)
    expect(roundTrip.nodes?.[0]).toMatchObject({
      id: 'card-a',
      x: 80,
      y: 120,
      width: 400,
      height: 220,
      text: 'Edited',
    })
  })

  it('maps an entity card to the entity flow type and preserves its metadata', () => {
    const entityCanvas: JsonCanvas = {
      nodes: [
        {
          id: 'repo-a',
          type: 'text',
          x: 0,
          y: 0,
          width: 380,
          height: 280,
          text: '## Repository: Canvas Engine',
          app: {
            entityType: 'repository',
            fields: { name: 'Canvas Engine', owner: 'Forge' },
          },
        },
      ],
      edges: [],
    }

    const flow = toFlowCanvas(entityCanvas)
    expect(flow.nodes[0]?.type).toBe('entity')
    expect(flow.nodes[0]?.data.entity).toEqual({
      entityType: 'repository',
      fields: { name: 'Canvas Engine', owner: 'Forge' },
    })

    const roundTrip = fromFlowCanvas(flow.nodes, flow.edges, entityCanvas)
    expect(roundTrip.nodes?.[0]?.app).toEqual({
      entityType: 'repository',
      fields: { name: 'Canvas Engine', owner: 'Forge' },
    })
  })

  it('maps a schema entity to the schema flow type', () => {
    const schemaCanvas: JsonCanvas = {
      nodes: [
        {
          id: 'schema-a',
          type: 'text',
          x: 0,
          y: 0,
          width: 560,
          height: 420,
          text: '## Schema: Order',
          app: {
            entityType: 'schema',
            fields: { name: 'Order', source: '{"type":"object"}' },
          },
        },
      ],
      edges: [],
    }

    const flow = toFlowCanvas(schemaCanvas)
    expect(flow.nodes[0]?.type).toBe('schema')
    expect(flow.nodes[0]?.data.entity?.entityType).toBe('schema')
  })

  it('maps a code entity to the code flow type', () => {
    const codeCanvas: JsonCanvas = {
      nodes: [
        {
          id: 'code-a',
          type: 'text',
          x: 0,
          y: 0,
          width: 560,
          height: 360,
          text: '## Code: Example',
          app: {
            entityType: 'code',
            fields: { title: 'Example', language: 'typescript', code: 'const value = 1' },
          },
        },
      ],
      edges: [],
    }

    const flow = toFlowCanvas(codeCanvas)
    expect(flow.nodes[0]?.type).toBe('code')
    expect(flow.nodes[0]?.data.entity).toMatchObject({
      entityType: 'code',
      fields: { language: 'typescript' },
    })
  })

  it('creates default edge handles for edges without sides', () => {
    const node = toFlowNode({
      id: 'card-a',
      type: 'text',
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      text: '',
    })

    expect(node.type).toBe('text')
    expect(node.position).toEqual({ x: 0, y: 0 })
  })
})


describe('card color backgrounds', () => {
  it('uses opaque card fills', () => {
    expect(cardBackgroundFor('1')).toBe('color-mix(in srgb, #fb464c 14%, var(--ui-panel-solid))')
  })
})


describe('obsidian import fidelity', () => {
  it('round-trips file, link, group, edge, and unknown fields', () => {
    const canvas: JsonCanvas = {
      nodes: [
        { id: 'text', type: 'text', x: 0, y: 0, width: 300, height: 180, text: '# Text', color: '4', styleAttributes: { align: 'center' } },
        { id: 'file', type: 'file', x: 340, y: 0, width: 300, height: 180, file: 'Notes/Test.md', subpath: '#Heading', ratio: 1.25 },
        { id: 'link', type: 'link', x: 0, y: 220, width: 300, height: 140, url: 'https://obsidian.md' },
        { id: 'group', type: 'group', x: -40, y: -40, width: 720, height: 440, label: 'Group', background: 'Assets/bg.png', backgroundStyle: 'cover' },
      ],
      edges: [
        { id: 'edge', fromNode: 'text', fromSide: 'right', toNode: 'file', toSide: 'left', toEnd: 'arrow', label: 'references', toFloating: true, styleAttributes: { stroke: 'dashed' } },
      ],
      metadata: { version: '1.0-1.0', frontmatter: { source: 'obsidian' } },
    }

    const flow = toFlowCanvas(canvas)
    const roundTrip = fromFlowCanvas(flow.nodes, flow.edges, canvas)
    expect(roundTrip).toEqual(canvas)
  })
})
