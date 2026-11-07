import { describe, expect, it } from 'vitest'

import {
  DEFAULT_ONTOLOGY,
  emptyEntityFields,
  entityTitle,
  findEntityType,
  getEntityMeta,
  renderEntityMarkdown,
} from './ontology'

describe('default ontology', () => {
  it('has unique entity, field, and relation identifiers', () => {
    const entityIds = DEFAULT_ONTOLOGY.entityTypes.map((entity) => entity.id)
    const relationIds = DEFAULT_ONTOLOGY.relationTypes.map((relation) => relation.id)
    expect(new Set(entityIds).size).toBe(entityIds.length)
    expect(new Set(relationIds).size).toBe(relationIds.length)

    for (const entity of DEFAULT_ONTOLOGY.entityTypes) {
      const fieldIds = entity.fields.map((field) => field.key)
      expect(new Set(fieldIds).size).toBe(fieldIds.length)
      expect(fieldIds).toContain(entity.fields.find((field) => field.primary)?.key)
    }
  })

  it('renders structured fields into an obsidian-friendly markdown summary', () => {
    const repository = findEntityType(DEFAULT_ONTOLOGY, 'repository')
    expect(repository).toBeTruthy()
    if (!repository) return

    const fields = emptyEntityFields(repository)
    fields.name = 'Canvas Engine'
    fields.owner = 'Forge'
    fields.url = 'https://github.com/Canvas-Wildfire/app-engine'

    expect(entityTitle(repository, fields)).toBe('Canvas Engine')
    const markdown = renderEntityMarkdown(repository, fields)
    expect(markdown).toContain('## Repository: Canvas Engine')
    expect(markdown).toContain('- **Owner:** Forge')
    expect(markdown).toContain('- **URL:** https://github.com/Canvas-Wildfire/app-engine')
  })

  it('parses entity metadata from a node extension', () => {
    const meta = getEntityMeta({
      app: {
        entityType: 'database',
        fields: { name: 'Postgres', environment: 'production' },
      },
    })
    expect(meta).toEqual({
      entityType: 'database',
      fields: { name: 'Postgres', environment: 'production' },
    })
  })
})
