import { describe, expect, it } from 'vitest'

import { DEFAULT_ONTOLOGY } from '@canvas/contract'

import { toFlowNode } from './adapter'
import { convertNodeType } from './cardTypes'

describe('convertNodeType', () => {
  it('converts a text card to an entity and keeps the text in a textarea field', () => {
    const text = toFlowNode({
      id: 'card',
      type: 'text',
      x: 0,
      y: 0,
      width: 320,
      height: 180,
      text: 'Important notes',
    })

    const converted = convertNodeType(text, 'system', DEFAULT_ONTOLOGY)
    expect(converted.type).toBe('entity')
    expect(converted.data.entity).toMatchObject({
      entityType: 'system',
      fields: { purpose: 'Important notes' },
    })
    expect(converted.data.text).toContain('System')
  })

  it('preserves matching fields when switching entity types', () => {
    const repository = toFlowNode({
      id: 'repo',
      type: 'text',
      x: 0,
      y: 0,
      width: 380,
      height: 280,
      text: '## Repository',
      app: {
        entityType: 'repository',
        fields: { name: 'Shared', owner: 'Forge' },
      },
    })

    const system = convertNodeType(repository, 'system', DEFAULT_ONTOLOGY)
    expect(system.data.entity).toMatchObject({
      entityType: 'system',
      fields: { name: 'Shared', owner: 'Forge' },
    })
  })

  it('converts an entity back to a text card', () => {
    const repository = toFlowNode({
      id: 'repo',
      type: 'text',
      x: 0,
      y: 0,
      width: 380,
      height: 280,
      text: '## Repository: Shared',
      app: { entityType: 'repository', fields: { name: 'Shared' } },
    })

    const text = convertNodeType(repository, 'text', DEFAULT_ONTOLOGY)
    expect(text.type).toBe('text')
    expect(text.data.entity).toBeUndefined()
    expect(text.data.raw.app).toBeUndefined()
    expect(text.data.text).toContain('Repository: Shared')
  })

  it('converts file and link nodes to text', () => {
    const file = toFlowNode({
      id: 'file',
      type: 'file',
      x: 0,
      y: 0,
      width: 300,
      height: 180,
      file: 'Notes/Test.md',
      subpath: '#Heading',
    })
    const link = toFlowNode({
      id: 'link',
      type: 'link',
      x: 0,
      y: 200,
      width: 300,
      height: 140,
      url: 'https://obsidian.md',
    })

    expect(convertNodeType(file, 'text', DEFAULT_ONTOLOGY).data.text).toBe('**Notes/Test.md**\n\n#Heading')
    expect(convertNodeType(link, 'text', DEFAULT_ONTOLOGY).data.text).toBe('https://obsidian.md')
  })

  it('converts a text card to a schema card', () => {
    const text = toFlowNode({
      id: 'schema',
      type: 'text',
      x: 0,
      y: 0,
      width: 560,
      height: 420,
      text: 'Contract notes',
    })

    const converted = convertNodeType(text, 'schema', DEFAULT_ONTOLOGY)
    expect(converted.type).toBe('schema')
    expect(converted.data.entity?.entityType).toBe('schema')
    expect(converted.data.entity?.fields.source).toContain('$schema')
  })
})
