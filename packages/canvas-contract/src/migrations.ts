import type { CanvasDocument, CanvasEdge, CanvasNode, JsonCanvas } from './jsonCanvas'
import {
  DEFAULT_ONTOLOGY,
  findEntityType,
  findRelationType,
  getEdgeMeta,
  renderEntityMarkdown,
  type EntityFields,
} from './ontology'

export const CURRENT_CANVAS_DOCUMENT_SCHEMA_VERSION = 2

type UnstampedCanvasDocument = Omit<CanvasDocument, 'schemaVersion'> & {
  schemaVersion?: number
}

export type CanvasDocumentMigration = (document: CanvasDocument) => CanvasDocument

const SYSTEM_KINDS = new Set(['service', 'api', 'database', 'cli', 'worker'])

function migrateNode(node: CanvasNode): CanvasNode {
  const app = node.app
  if (!app?.entityType) return node
  let entityType = app.entityType
  const fields: EntityFields = { ...(app.fields ?? {}) }

  if (entityType === 'api' || entityType === 'database') {
    const surface = entityType
    entityType = 'system'
    fields.kind = surface
    if (surface === 'api') {
      if (fields.deploymentUrl == null && fields.docsUrl != null) fields.deploymentUrl = fields.docsUrl
      delete fields.docsUrl
      delete fields.protocol
    } else {
      if (fields.deploymentUrl == null && fields.consoleUrl != null) fields.deploymentUrl = fields.consoleUrl
      delete fields.consoleUrl
    }
  }

  if (entityType === 'system') {
    const kind = String(fields.kind ?? '')
    if (!SYSTEM_KINDS.has(kind)) fields.kind = 'service'
  }

  const definition = findEntityType(DEFAULT_ONTOLOGY, entityType)
  if (node.type !== 'text') return { ...node, app: { ...app, entityType, fields } }
  return {
    ...node,
    text: definition ? renderEntityMarkdown(definition, fields) : node.text,
    app: { ...app, entityType, fields },
  }
}

function migrateEdge(edge: CanvasEdge): CanvasEdge {
  const relation = getEdgeMeta(edge)?.relationType
  if (!relation) return edge
  const mapped = (
    relation === 'exposes'
    || relation === 'calls'
    || relation === 'stores_in'
    || relation === 'depends_on'
    || relation === 'orchestrates'
    || relation === 'references'
  ) ? 'uses' : relation
  if (mapped === relation) return edge
  const definition = findRelationType(DEFAULT_ONTOLOGY, mapped)
  return {
    ...edge,
    label: definition?.label ?? mapped,
    color: definition?.color ?? edge.color,
    app: { ...(edge.app ?? {}), relationType: mapped },
  }
}

function migrateSchemaKinds(nodes: CanvasNode[], edges: CanvasEdge[]): CanvasNode[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const schemaKinds = new Map<string, 'api' | 'database'>()
  for (const edge of edges) {
    if (getEdgeMeta(edge)?.relationType !== 'describes') continue
    const schema = nodesById.get(edge.fromNode)
    const target = nodesById.get(edge.toNode)
    if (!schema || !target || schema.app?.entityType !== 'schema') continue
    if (target.app?.entityType !== 'system') continue
    const kind = target.app.fields?.kind
    if (kind === 'api' || kind === 'database') schemaKinds.set(schema.id, kind)
  }
  return nodes.map((node) => {
    const kind = schemaKinds.get(node.id)
    if (!kind || node.app?.entityType !== 'schema') return node
    const fields = { ...(node.app.fields ?? {}), kind }
    return { ...node, app: { ...node.app, fields } }
  })
}

export function migrateSystemsCanvas(canvas: JsonCanvas): JsonCanvas {
  if (canvas.app?.profile !== 'systems') return canvas
  const edges = (canvas.edges ?? []).map(migrateEdge)
  const nodes = migrateSchemaKinds((canvas.nodes ?? []).map(migrateNode), edges)
  return {
    ...canvas,
    nodes,
    edges,
    app: {
      ...canvas.app,
      profileVersion: 4,
    },
  }
}

export const canvasDocumentMigrations: Record<number, CanvasDocumentMigration> = {
  0: (document) => ({ ...document, schemaVersion: 1 }),
  1: (document) => ({
    ...document,
    schemaVersion: 2,
    canvas: migrateSystemsCanvas(document.canvas),
  }),
}

export function migrateCanvasDocument(
  document: CanvasDocument | UnstampedCanvasDocument,
): CanvasDocument {
  let current = document as UnstampedCanvasDocument
  let version = current.schemaVersion ?? 0

  if (version > CURRENT_CANVAS_DOCUMENT_SCHEMA_VERSION) {
    throw new Error(`Unsupported canvas document schema version ${version}.`)
  }

  while (version < CURRENT_CANVAS_DOCUMENT_SCHEMA_VERSION) {
    const migration = canvasDocumentMigrations[version]
    if (!migration) {
      throw new Error(`No canvas document migration from schema version ${version}.`)
    }
    const next = migration(current as CanvasDocument)
    const nextVersion = next.schemaVersion
    if (!Number.isInteger(nextVersion) || nextVersion <= version) {
      throw new Error(`Canvas document migration from schema version ${version} did not advance the version.`)
    }
    current = next
    version = nextVersion
  }

  return current as CanvasDocument
}
