import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { getEntityMeta } from '../ontology'
import type { CanvasNode, JsonCanvas } from '../jsonCanvas'
import { API_PROFILE, profileMetadata } from '../profile'
import { addApiResource } from './addResource'
import { exportOpenApiDocument } from './exportOpenApi'
import { importOpenApi } from './importOpenApi'
import { deriveManagedRelations } from './managedRelations'
import { renameApiResource } from './renameResource'
import type { JsonObject } from './types'

function field(node: CanvasNode, key: string): string {
  const value = getEntityMeta(node)?.fields[key]
  return value == null ? '' : String(value)
}

function name(node: CanvasNode): string {
  return field(node, 'path') ? `${field(node, 'method')} ${field(node, 'path')}` : field(node, 'name') || field(node, 'title') || node.id
}

function card(
  id: string,
  entityType: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fields: Record<string, string>,
): CanvasNode {
  return { id, type: 'text', x, y, width, height, text: '', app: { entityType, fields } }
}

function overlaps(existing: CanvasNode[], added: CanvasNode[]): string[] {
  const all = [...existing, ...added]
  const result: string[] = []
  for (const left of added) {
    for (const right of all) {
      if (left.id === right.id) continue
      const leftMembers = left.app?.groupMembers ?? []
      const rightMembers = right.app?.groupMembers ?? []
      if (leftMembers.includes(right.id) || rightMembers.includes(left.id)) continue
      if (left.x < right.x + right.width && right.x < left.x + left.width
        && left.y < right.y + right.height && right.y < left.y + left.height) {
        result.push(`${name(left)} overlaps ${existing.includes(right) ? 'existing ' : ''}${name(right)}`)
      }
    }
  }
  return [...new Set(result)]
}

function firstEndpointForSchema(endpoints: CanvasNode[], schemaName: string): CanvasNode | undefined {
  return endpoints.find((endpoint) => {
    try {
      const operation = JSON.parse(String(getEntityMeta(endpoint)?.fields.operation ?? '{}'))
      const ref = `"#/components/schemas/${schemaName}"`
      const request = JSON.stringify(operation.requestBody ?? {})
      const responses = JSON.stringify(operation.responses ?? {})
      return request.includes(ref) || responses.includes(ref)
    } catch {
      return false
    }
  })
}

const sample = readFileSync(new URL('../../../../examples/simple-tasks-api.yaml', import.meta.url), 'utf8')

describe('Phase 2 review fixes', () => {
  it('places new cards without overlaps in the three target canvases', () => {
    const imported = importOpenApi(sample).canvas
    const nudged = structuredClone(imported)
    for (const node of nudged.nodes ?? []) {
      if (getEntityMeta(node)?.entityType === 'schema') node.x += 30
    }
    const cases: Array<[string, JsonCanvas, boolean]> = [
      ['empty canvas', { nodes: [], edges: [], app: profileMetadata(API_PROFILE) }, true],
      ['API and Security only', {
        nodes: [
          card('api', 'api_definition', 0, 0, 420, 220, { title: 'X', version: '1' }),
          card('security', 'security_scheme', 500, 0, 360, 200, { name: 'Bearer', type: 'http' }),
        ],
        edges: [],
        app: profileMetadata(API_PROFILE),
      }, true],
      ['imported with models nudged', nudged, false],
    ]

    for (const [label, canvas, levelModels] of cases) {
      const result = addApiResource(canvas, {
        singular: 'project',
        plural: 'projects',
        pathPrefix: '',
        idParameter: 'project_id',
      })
      expect(result.errors, label).toEqual([])
      expect(overlaps(canvas.nodes ?? [], result.nodes), label).toEqual([])
      const endpoints = result.nodes.filter((node) => getEntityMeta(node)?.entityType === 'endpoint')
      const schemas = result.nodes.filter((node) => getEntityMeta(node)?.entityType === 'schema')
      for (const schema of schemas) {
        const user = firstEndpointForSchema(endpoints, field(schema, 'name'))
        expect(user, `${label}: ${field(schema, 'name')} has a user`).toBeDefined()
        expect(schema.y, `${label}: ${field(schema, 'name')} not above user`).toBeGreaterThanOrEqual(user!.y)
        const sameColumnAbove = schemas.some((other) => other.id !== schema.id
          && other.x === schema.x
          && other.y < schema.y)
        if (levelModels && !sameColumnAbove) {
          expect(schema.y, `${label}: ${field(schema, 'name')} level`).toBe(user!.y)
        }
      }
      const lane = result.nodes.find((node) => getEntityMeta(node)?.entityType === 'resource')!
      expect(lane.y, label).toBeGreaterThan(Math.max(0, ...(canvas.nodes ?? []).map((node) => node.y + node.height)))
    }
  })

  it('renames a Resource, its endpoint tags, and the exported top-level tag', () => {
    const canvas = structuredClone(importOpenApi(sample).canvas)
    const resource = (canvas.nodes ?? []).find((node) => (
      getEntityMeta(node)?.entityType === 'resource' && field(node, 'name') === 'Tasks'
    ))!
    const endpoint = (canvas.nodes ?? []).find((node) => field(node, 'path') === '/tasks')!
    const operation = JSON.parse(field(endpoint, 'operation'))
    operation.tags = ['Tasks', 'Secondary']
    endpoint.app = { ...(endpoint.app ?? {}), fields: { ...(getEntityMeta(endpoint)?.fields ?? {}), operation: JSON.stringify(operation, null, 2) } }

    const renamed = renameApiResource(canvas, resource.id, 'Todos')
    const resourceAfter = renamed.nodes.find((node) => node.id === resource.id)!
    expect(field(resourceAfter, 'name')).toBe('Todos')
    expect(JSON.parse(field(renamed.nodes.find((node) => node.id === endpoint.id)!, 'operation')).tags)
      .toEqual(['Todos', 'Secondary'])
    const document = exportOpenApiDocument({ ...canvas, nodes: renamed.nodes })
    expect((document.tags as Array<{ name: string }>).map((tag) => tag.name)).toEqual(['Todos', 'Health'])
    expect(((document.paths as Record<string, JsonObject>)['/tasks']?.get as JsonObject)?.tags).toEqual(['Todos', 'Secondary'])
    const contains = deriveManagedRelations({ ...canvas, nodes: renamed.nodes }).filter((edge) => (
      edge.fromNode === resource.id && edge.app?.relationType === 'contains'
    ))
    expect(contains.length).toBeGreaterThan(0)
    expect(renamed.changed).toBe(6)
  })

  it('round-trips all API and Security form fields through export and import', () => {
    const { canvas } = importOpenApi({
      openapi: '3.1.0',
      info: { title: 'Forms API', version: '1.0.0', contact: { email: 'ops@example.com' } },
      components: {
        securitySchemes: {
          BearerAuth: { type: 'http', scheme: 'bearer' },
          KeyAuth: { type: 'apiKey', in: 'header', name: 'X-Key' },
          OidcAuth: { type: 'openIdConnect', openIdConnectUrl: 'https://example.com/.well-known' },
          OAuth: { type: 'oauth2', flows: { clientCredentials: { tokenUrl: 'https://example.com/token', scopes: {} } } },
        },
      },
    })
    const api = canvas.nodes!.find((node) => getEntityMeta(node)?.entityType === 'api_definition')!
    api.app = {
      ...(api.app ?? {}),
      fields: {
        ...(getEntityMeta(api)?.fields ?? {}),
        title: 'Updated API',
        version: '2.0.0',
        description: 'Updated description',
        servers: 'https://one.example.com\nhttps://two.example.com',
        owner: 'Tower',
        status: 'planned',
        reviewStatus: 'approved',
        reviewedVersion: '2.0.0',
        lastReviewed: '2026-01-02',
        reviewIntervalDays: 60,
        extra: JSON.stringify({
          ...JSON.parse(String((getEntityMeta(api)?.fields.extra) || '{}')),
          'x-top': true,
        }),
      },
    }
    const security = canvas.nodes!.filter((node) => getEntityMeta(node)?.entityType === 'security_scheme')
    const byName = new Map(security.map((node) => [field(node, 'name'), node]))
    function update(nameValue: string, fields: Record<string, string>) {
      const node = byName.get(nameValue)!
      node.app = { ...(node.app ?? {}), fields: { ...(getEntityMeta(node)?.fields ?? {}), ...fields } }
    }
    update('BearerAuth', { description: 'Bearer tokens', scheme: 'bearer', bearerFormat: 'JWT' })
    update('KeyAuth', { description: 'Key auth', in: 'header', parameterName: 'X-Api-Key' })
    update('OidcAuth', { description: 'OIDC', discoveryUrl: 'https://example.com/discovery' })
    update('OAuth', { description: 'OAuth', flows: JSON.stringify({ authorizationCode: { authorizationUrl: 'https://example.com/auth', tokenUrl: 'https://example.com/token', scopes: { read: 'Read' } } }) })

    const exported = exportOpenApiDocument(canvas)
    expect((exported.info as JsonObject | undefined)?.contact).toEqual({ email: 'ops@example.com', name: 'Tower' })
    expect((exported.servers as JsonObject[]).map((server) => server.url)).toEqual([
      'https://one.example.com',
      'https://two.example.com',
    ])
    expect(exported['x-status']).toBe('planned')
    expect(exported['x-review-status']).toBe('approved')
    expect(exported['x-reviewed-version']).toBe('2.0.0')
    expect(exported['x-last-reviewed']).toBe('2026-01-02')
    expect(exported['x-review-interval-days']).toBe(60)
    const schemes = (exported.components as JsonObject).securitySchemes as Record<string, JsonObject>
    expect(schemes.BearerAuth).toMatchObject({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Bearer tokens' })
    expect(schemes.KeyAuth).toMatchObject({ type: 'apiKey', in: 'header', name: 'X-Api-Key', description: 'Key auth' })
    expect(schemes.OidcAuth).toMatchObject({ type: 'openIdConnect', openIdConnectUrl: 'https://example.com/discovery', description: 'OIDC' })
    expect(((schemes.OAuth?.flows as JsonObject).authorizationCode as JsonObject).scopes).toEqual({ read: 'Read' })

    const reimported = importOpenApi(exported).canvas
    const reimportedApi = reimported.nodes!.find((node) => getEntityMeta(node)?.entityType === 'api_definition')!
    expect(getEntityMeta(reimportedApi)?.fields).toMatchObject({
      owner: 'Tower',
      status: 'planned',
      reviewStatus: 'approved',
      reviewedVersion: '2.0.0',
      lastReviewed: '2026-01-02',
      reviewIntervalDays: 60,
    })
    const reimportedSecurity = new Map(reimported.nodes!
      .filter((node) => getEntityMeta(node)?.entityType === 'security_scheme')
      .map((node) => [field(node, 'name'), getEntityMeta(node)?.fields]))
    expect(reimportedSecurity.get('BearerAuth')).toMatchObject({ scheme: 'bearer', bearerFormat: 'JWT' })
    expect(reimportedSecurity.get('KeyAuth')).toMatchObject({ in: 'header', parameterName: 'X-Api-Key' })
    expect(reimportedSecurity.get('OidcAuth')).toMatchObject({ discoveryUrl: 'https://example.com/discovery' })
    expect(JSON.parse(String(reimportedSecurity.get('OAuth')?.flows))).toEqual({
      authorizationCode: { authorizationUrl: 'https://example.com/auth', tokenUrl: 'https://example.com/token', scopes: { read: 'Read' } },
    })
    expect(exportOpenApiDocument(reimported)).toEqual(exported)
  })
})
