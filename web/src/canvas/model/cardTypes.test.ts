import { describe, expect, it } from 'vitest'

import { DEFAULT_ONTOLOGY } from '@skyward/canvas-contract'

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

    const converted = convertNodeType(text, 'repository', DEFAULT_ONTOLOGY)
    expect(converted.type).toBe('entity')
    expect(converted.data.entity).toMatchObject({
      entityType: 'repository',
      fields: { notes: 'Important notes' },
    })
    expect(converted.data.text).toContain('Repository')
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
      skyward: {
        entityType: 'repository',
        fields: { name: 'Shared', owner: 'Forge', notes: 'Keep this' },
      },
    })

    const database = convertNodeType(repository, 'database', DEFAULT_ONTOLOGY)
    expect(database.data.entity).toMatchObject({
      entityType: 'database',
      fields: { name: 'Shared', owner: 'Forge', notes: 'Keep this' },
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
      skyward: { entityType: 'repository', fields: { name: 'Shared' } },
    })

    const text = convertNodeType(repository, 'text', DEFAULT_ONTOLOGY)
    expect(text.type).toBe('text')
    expect(text.data.entity).toBeUndefined()
    expect(text.data.raw.skyward).toBeUndefined()
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
})
