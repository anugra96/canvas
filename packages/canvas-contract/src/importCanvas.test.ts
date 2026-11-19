import { describe, expect, it } from 'vitest'

import { normalizeImportedCanvas } from './importCanvas'

describe('normalizeImportedCanvas', () => {
  it('converts file nodes to bold text cards and preserves the path metadata', () => {
    const normalized = normalizeImportedCanvas({
      nodes: [
        {
          id: 'file-card',
          type: 'file',
          x: 0,
          y: 0,
          width: 320,
          height: 200,
          file: 'Notes/Example.md',
          subpath: '#Heading',
          ratio: 1.25,
          color: '4',
        },
      ],
      edges: [],
    }) as {
      nodes: Array<Record<string, unknown>>
    }

    expect(normalized.nodes[0]).toMatchObject({
      id: 'file-card',
      type: 'text',
      text: '**Notes/Example.md**\n\n#Heading',
      color: '4',
      app: { importedFile: { file: 'Notes/Example.md', subpath: '#Heading' } },
    })
    expect(normalized.nodes[0]).not.toHaveProperty('file')
    expect(normalized.nodes[0]).not.toHaveProperty('subpath')
    expect(normalized.nodes[0]).not.toHaveProperty('ratio')
  })

  it('leaves non-file nodes and invalid values unchanged', () => {
    const input = {
      nodes: [{ id: 'text', type: 'text', x: 0, y: 0, width: 100, height: 100, text: 'Hello' }],
      edges: [],
    }
    expect(normalizeImportedCanvas(input)).toEqual(input)
    expect(normalizeImportedCanvas('not a canvas')).toBe('not a canvas')
  })

  it('runs imported Systems canvases through the ontology migration', () => {
    const normalized = normalizeImportedCanvas({
      app: { profile: 'systems', profileVersion: 3, scope: 'container' },
      nodes: [{
        id: 'service',
        type: 'text',
        x: 0,
        y: 0,
        width: 320,
        height: 200,
        text: '',
        app: { entityType: 'service', fields: { name: 'Legacy service' } },
      }],
      edges: [{
        id: 'edge',
        fromNode: 'service',
        toNode: 'service',
        app: { relationType: 'depends_on' },
      }],
    }) as { app: Record<string, unknown>; nodes: Array<Record<string, unknown>>; edges: Array<Record<string, unknown>> }

    expect(normalized.app).toMatchObject({ profileVersion: 5 })
    expect(normalized.nodes[0]?.app).toMatchObject({
      entityType: 'system',
      fields: { name: 'Legacy service', kind: 'service' },
    })
    expect(normalized.edges[0]?.app).toMatchObject({ relationType: 'uses' })
  })
})
