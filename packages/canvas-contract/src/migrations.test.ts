import { describe, expect, it } from 'vitest'

import type { CanvasDocument, CanvasEdge, CanvasNode } from './jsonCanvas'
import {
  CURRENT_CANVAS_DOCUMENT_SCHEMA_VERSION,
  migrateCanvasDocument,
} from './migrations'
import { DEFAULT_ONTOLOGY } from './ontology'
import { SYSTEMS_PROFILE, validateProfileCanvas } from './profile'

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

  it('migrates every removed card and line type without losing data', () => {
    const cards: Array<{
      id: string
      entityType: string
      fields: Record<string, string>
      expectedType: string
      expectedKind?: string
      contains: string[]
      absent?: string[]
      url?: string
      version?: string
      name?: string
    }> = [
      {
        id: 'legacy-service',
        entityType: 'service',
        fields: { name: 'Legacy Service', responsibility: 'Owns requests', owner: 'Forge', status: 'active' },
        expectedType: 'system',
        expectedKind: 'service',
        contains: ['## System: Legacy Service', 'Owns requests'],
        absent: ['Status: active'],
      },
      {
        id: 'legacy-vendor',
        entityType: 'external_system',
        fields: {
          name: 'Vendor',
          vendor: 'Acme',
          purpose: 'Auth',
          contractUrl: 'https://vendor.example/contract',
          owner: 'Ops',
          notes: 'Vendor note',
        },
        expectedType: 'system',
        expectedKind: 'external',
        contains: ['Vendor: Acme', 'Contract URL: https://vendor.example/contract', 'Notes: Vendor note'],
      },
      {
        id: 'legacy-queue',
        entityType: 'queue',
        fields: { name: 'Work Queue', kind: 'topic', delivery: 'exactly_once', owner: 'Ops', notes: 'Async' },
        expectedType: 'system',
        expectedKind: 'queue',
        contains: ['Kind: topic', 'Delivery: exactly_once', 'Notes: Async'],
      },
      {
        id: 'legacy-api',
        entityType: 'api',
        fields: {
          name: 'Orders API',
          purpose: 'Serves orders',
          protocol: 'grpc',
          owner: 'Forge',
          docsUrl: 'https://docs.example',
          status: 'deprecated',
        },
        expectedType: 'system',
        expectedKind: 'api',
        contains: ['Protocol: grpc', 'Status: deprecated'],
        url: 'https://docs.example',
      },
      {
        id: 'legacy-database',
        entityType: 'database',
        fields: {
          name: 'Store',
          purpose: 'Data',
          kind: 'document',
          owner: 'Tower',
          consoleUrl: 'https://console.example',
          status: 'active',
        },
        expectedType: 'system',
        expectedKind: 'database',
        contains: ['Kind: document'],
        absent: ['Status: active'],
        url: 'https://console.example',
      },
      {
        id: 'legacy-process',
        entityType: 'process',
        fields: {
          name: 'Nightly Job',
          purpose: 'Rebuild',
          mode: 'automated',
          owner: 'Ops',
          runbookUrl: 'https://runbook.example',
          status: 'planned',
        },
        expectedType: 'system',
        expectedKind: 'job',
        contains: ['Mode: automated', 'Runbook URL: https://runbook.example'],
        absent: ['Status: planned'],
      },
      {
        id: 'legacy-event',
        entityType: 'event',
        fields: {
          name: 'Deployment Ready',
          version: '2',
          schemaUrl: 'https://schema.example',
          owner: 'Forge',
          notes: 'Event contract',
        },
        expectedType: 'schema',
        expectedKind: 'event',
        contains: ['## Schema: Deployment Ready', 'Schema URL', 'https://schema.example', 'Event contract'],
        version: '2',
      },
      {
        id: 'legacy-requirement',
        entityType: 'requirement',
        fields: {
          title: 'Must log',
          priority: 'must',
          acceptance: 'Audit trail',
          owner: 'Compliance',
          status: 'done',
        },
        expectedType: 'note',
        expectedKind: 'question',
        contains: ['Priority: must', 'Acceptance: Audit trail', 'Owner: Compliance', 'Status: done'],
        name: 'Must log',
      },
      {
        id: 'legacy-decision',
        entityType: 'decision',
        fields: { title: 'Use Postgres', status: 'accepted', rationale: 'Operational fit', owner: 'Arch' },
        expectedType: 'note',
        expectedKind: 'decision',
        contains: ['Status: accepted', 'Rationale: Operational fit', 'Owner: Arch'],
        name: 'Use Postgres',
      },
      {
        id: 'legacy-risk',
        entityType: 'risk',
        fields: {
          title: 'Single region',
          severity: 'high',
          owner: 'Ops',
          mitigation: 'Add replicas',
          status: 'open',
        },
        expectedType: 'note',
        expectedKind: 'risk',
        contains: ['Severity: high', 'Owner: Ops', 'Mitigation: Add replicas'],
        absent: ['Status: open'],
        name: 'Single region',
      },
      {
        id: 'kept-system',
        entityType: 'system',
        fields: {
          name: 'Kept System',
          kind: 'worker',
          purpose: 'Works',
          owner: 'Forge',
          deploymentUrl: 'https://kept.example',
          status: 'planned',
        },
        expectedType: 'system',
        expectedKind: 'worker',
        contains: ['## System: Kept System'],
        absent: ['Status: planned'],
        url: 'https://kept.example',
      },
      {
        id: 'kept-repository',
        entityType: 'repository',
        fields: {
          name: 'Kept Repo',
          provider: 'github',
          url: 'https://repo.example',
          defaultBranch: 'main',
          owner: 'Forge',
          status: 'active',
        },
        expectedType: 'repository',
        contains: ['Default branch: main'],
        absent: ['Provider: github', 'Status: active'],
      },
      {
        id: 'kept-artifact',
        entityType: 'artifact',
        fields: { name: 'Image', kind: 'container', version: '1', digest: 'sha256:abc', status: 'published' },
        expectedType: 'artifact',
        contains: ['Digest: sha256:abc', 'Status: published'],
      },
      {
        id: 'kept-actor',
        entityType: 'actor',
        fields: { name: 'Operator', kind: 'role', responsibility: 'Runs things' },
        expectedType: 'actor',
        contains: ['Runs things'],
      },
    ]

    const lineCases: Array<[string, string, string, string]> = [
      ['depends_on', 'uses', 'system-core', 'system-other'],
      ['owns', 'uses', 'actor-owner', 'repo-main'],
      ['calls', 'uses', 'system-core', 'system-other'],
      ['reads_from', 'uses', 'system-core', 'legacy-queue'],
      ['writes_to', 'uses', 'system-core', 'legacy-database'],
      ['deploys_to', 'uses', 'system-core', 'kept-artifact'],
      ['implements', 'uses', 'system-core', 'legacy-event'],
      ['exposes', 'uses', 'system-core', 'legacy-event'],
      ['publishes', 'produces', 'system-core', 'kept-artifact'],
      ['consumes', 'uses', 'system-core', 'legacy-event'],
      ['carries', 'uses', 'system-core', 'kept-artifact'],
      ['emits', 'produces', 'system-core', 'kept-artifact'],
      ['handles', 'uses', 'system-core', 'legacy-event'],
      ['stores_in', 'uses', 'system-core', 'legacy-database'],
      ['runs', 'uses', 'actor-owner', 'legacy-process'],
      ['orchestrates', 'uses', 'system-core', 'legacy-process'],
    ]

    const nodes: CanvasNode[] = [
      ...cards.map((card) => ({
        id: card.id,
        type: 'text' as const,
        x: 0,
        y: 0,
        width: 320,
        height: 200,
        text: '',
        app: { entityType: card.entityType, fields: { ...card.fields } },
      })),
      {
        id: 'system-core',
        type: 'text' as const,
        x: 0,
        y: 0,
        width: 320,
        height: 200,
        text: '',
        app: { entityType: 'system', fields: { name: 'Core', kind: 'service' } },
      },
      {
        id: 'system-other',
        type: 'text' as const,
        x: 0,
        y: 0,
        width: 320,
        height: 200,
        text: '',
        app: { entityType: 'system', fields: { name: 'Other', kind: 'service' } },
      },
      {
        id: 'actor-owner',
        type: 'text' as const,
        x: 0,
        y: 0,
        width: 320,
        height: 200,
        text: '',
        app: { entityType: 'actor', fields: { name: 'Owner', kind: 'role' } },
      },
      {
        id: 'repo-main',
        type: 'text' as const,
        x: 0,
        y: 0,
        width: 320,
        height: 200,
        text: '',
        app: { entityType: 'repository', fields: { name: 'Main' } },
      },
    ]

    const edges: CanvasEdge[] = lineCases.map(([relation, , fromNode, toNode], index) => ({
      id: `line-${index}-${relation}`,
      fromNode,
      toNode,
      app: { relationType: relation },
    }))
    edges.push({
      id: 'line-describes',
      fromNode: 'legacy-event',
      toNode: 'legacy-api',
      fromSide: 'right',
      toSide: 'left',
      app: { relationType: 'describes' },
    })
    edges.push({
      id: 'invalid-annotation',
      fromNode: 'system-core',
      toNode: 'system-other',
      app: { relationType: 'relates_to' },
    })

    const document: CanvasDocument = {
      ...legacyDocument(),
      schemaVersion: 2,
      canvas: {
        app: { profile: 'systems', profileVersion: 4, scope: 'container' },
        nodes,
        edges,
      },
    }

    const migrated = migrateCanvasDocument(document)
    expect(migrated.schemaVersion).toBe(3)
    expect(migrated.canvas.app).toMatchObject({ profileVersion: 5 })

    const byId = new Map((migrated.canvas.nodes ?? []).map((node) => [node.id, node]))
    for (const card of cards) {
      const node = byId.get(card.id)
      expect(node, card.id).toBeDefined()
      const fields = node?.app?.fields ?? {}
      expect(node?.app?.entityType, card.id).toBe(card.expectedType)
      if (card.expectedKind) expect(fields.kind, card.id).toBe(card.expectedKind)
      if ('name' in card && card.name) expect(fields.name, card.id).toBe(card.name)
      if ('url' in card && card.url) expect(fields.url, card.id).toBe(card.url)
      if ('version' in card && card.version) expect(fields.version, card.id).toBe(card.version)
      for (const text of card.contains) {
        expect(node?.text, `${card.id} text`).toContain(text)
      }
      for (const text of card.absent ?? []) {
        expect(node?.text, `${card.id} text`).not.toContain(text)
      }
    }

    const migratedEdges = new Map((migrated.canvas.edges ?? []).map((edge) => [edge.id, edge]))
    expect(migratedEdges.size).toBe(edges.length)
    for (const [index, [relation, expected, fromNode, toNode]] of lineCases.entries()) {
      const edge = migratedEdges.get(`line-${index}-${relation}`)
      expect(edge?.app?.relationType, relation).toBe(expected)
      expect(edge?.fromNode, relation).toBe(fromNode)
      expect(edge?.toNode, relation).toBe(toNode)
    }
    expect(migratedEdges.get('line-describes')).toMatchObject({
      fromNode: 'legacy-api',
      toNode: 'legacy-event',
      fromSide: 'left',
      toSide: 'right',
      app: { relationType: 'defines' },
    })

    const issues = validateProfileCanvas(migrated.canvas, SYSTEMS_PROFILE, DEFAULT_ONTOLOGY)
    expect(issues.map((issue) => `${issue.code}:${issue.edgeId ?? issue.nodeId}`))
      .toEqual(['relation_not_allowed:invalid-annotation'])
  })

  it('keeps Raw line types while moving cards to the new vocabulary', () => {
    const document: CanvasDocument = {
      ...legacyDocument(),
      schemaVersion: 2,
      canvas: {
        nodes: [{
          id: 'service',
          type: 'text',
          x: 0,
          y: 0,
          width: 300,
          height: 200,
          text: '',
          app: { entityType: 'service', fields: { name: 'Raw service' } },
        }],
        edges: [{
          id: 'edge',
          fromNode: 'service',
          toNode: 'service',
          app: { relationType: 'depends_on' },
        }],
      },
    }

    const migrated = migrateCanvasDocument(document)
    expect(migrated.canvas.nodes?.[0]?.app).toMatchObject({
      entityType: 'system',
      fields: { name: 'Raw service', kind: 'service' },
    })
    expect(migrated.canvas.edges?.[0]?.app).toMatchObject({ relationType: 'depends_on' })
  })
})
