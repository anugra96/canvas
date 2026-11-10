import { describe, expect, it } from 'vitest'

import type { CanvasDocument } from './jsonCanvas'
import {
  CURRENT_CANVAS_DOCUMENT_SCHEMA_VERSION,
  migrateCanvasDocument,
} from './migrations'

function legacyDocument(): Omit<CanvasDocument, 'schemaVersion'> {
  return {
    id: 'canvas-1',
    title: 'Legacy canvas',
    etag: 'etag-1',
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedBy: 'Tester',
    nodeCount: 0,
    edgeCount: 0,
    canvas: { nodes: [], edges: [] },
  }
}

describe('migrateCanvasDocument', () => {
  it('stamps legacy documents with the current schema version', () => {
    const migrated = migrateCanvasDocument(legacyDocument())
    expect(migrated.schemaVersion).toBe(CURRENT_CANVAS_DOCUMENT_SCHEMA_VERSION)
    expect(migrated.canvas).toEqual({ nodes: [], edges: [] })
  })

  it('keeps current documents unchanged', () => {
    const current: CanvasDocument = {
      ...legacyDocument(),
      schemaVersion: CURRENT_CANVAS_DOCUMENT_SCHEMA_VERSION,
    }
    expect(migrateCanvasDocument(current)).toEqual(current)
  })

  it('rejects future schema versions', () => {
    expect(() => migrateCanvasDocument({
      ...legacyDocument(),
      schemaVersion: CURRENT_CANVAS_DOCUMENT_SCHEMA_VERSION + 1,
    })).toThrow('Unsupported canvas document schema version')
  })

  it('migrates Systems v3 API and database cards into System kinds', () => {
    const document: CanvasDocument = {
      ...legacyDocument(),
      schemaVersion: 1,
      canvas: {
        app: { profile: 'systems', profileVersion: 3, scope: 'container' },
        nodes: [
          {
            id: 'api',
            type: 'text',
            x: 0,
            y: 0,
            width: 300,
            height: 200,
            text: '## API: Registry',
            app: { entityType: 'api', fields: { name: 'Registry', kind: 'http', status: 'active' } },
          },
          {
            id: 'db',
            type: 'text',
            x: 400,
            y: 0,
            width: 300,
            height: 200,
            text: '## Database: Tables',
            app: { entityType: 'database', fields: { name: 'Tables', kind: 'relational', status: 'active' } },
          },
        ],
        edges: [
          {
            id: 'edge',
            fromNode: 'api',
            toNode: 'db',
            app: { relationType: 'stores_in' },
          },
        ],
      },
    }

    const migrated = migrateCanvasDocument(document)
    expect(migrated.schemaVersion).toBe(2)
    expect(migrated.canvas.app).toMatchObject({ profileVersion: 4 })
    expect(migrated.canvas.nodes?.[0]?.app).toMatchObject({
      entityType: 'system',
      fields: { name: 'Registry', kind: 'api', status: 'active' },
    })
    expect(migrated.canvas.nodes?.[1]?.app).toMatchObject({
      entityType: 'system',
      fields: { name: 'Tables', kind: 'database', status: 'active' },
    })
    expect(migrated.canvas.nodes?.[0]?.text).toContain('## System: Registry')
    expect(migrated.canvas.edges?.[0]?.app).toMatchObject({ relationType: 'uses' })
  })

})
