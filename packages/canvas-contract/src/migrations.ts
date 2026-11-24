import type { CanvasDocument, CanvasEdge, CanvasNode, JsonCanvas } from './jsonCanvas'
import {
  DEFAULT_ONTOLOGY,
  findEntityType,
  findRelationType,
  getEdgeMeta,
  renderEntityMarkdown,
  type EntityFields,
} from './ontology'
import { parseTableDefinition, stringifyTableDefinition } from './database/model'

export const CURRENT_CANVAS_DOCUMENT_SCHEMA_VERSION = 4

type UnstampedCanvasDocument = Omit<CanvasDocument, 'schemaVersion'> & {
  schemaVersion?: number
}

export type CanvasDocumentMigration = (document: CanvasDocument) => CanvasDocument

const SYSTEM_KINDS = new Set(['service', 'api', 'database', 'queue', 'worker', 'job', 'cli', 'external'])

interface LegacyField {
  key: string
  label: string
  defaultValue?: string | number
}

const LEGACY_FIELDS: Record<string, LegacyField[]> = {
  repository: [
    { key: 'name', label: 'Name' },
    { key: 'provider', label: 'Provider', defaultValue: 'github' },
    { key: 'url', label: 'URL' },
    { key: 'defaultBranch', label: 'Default branch' },
    { key: 'owner', label: 'Owner' },
    { key: 'status', label: 'Status', defaultValue: 'active' },
  ],
  database: [
    { key: 'name', label: 'Name' },
    { key: 'purpose', label: 'Purpose' },
    { key: 'kind', label: 'Kind', defaultValue: 'relational' },
    { key: 'owner', label: 'Owner' },
    { key: 'consoleUrl', label: 'Console URL' },
    { key: 'status', label: 'Status', defaultValue: 'active' },
  ],
  service: [
    { key: 'name', label: 'Name' },
    { key: 'responsibility', label: 'Responsibility' },
    { key: 'owner', label: 'Owner' },
    { key: 'status', label: 'Status' },
  ],
  api: [
    { key: 'name', label: 'Name' },
    { key: 'purpose', label: 'Purpose' },
    { key: 'protocol', label: 'Protocol', defaultValue: 'http' },
    { key: 'owner', label: 'Owner' },
    { key: 'docsUrl', label: 'Docs URL' },
    { key: 'status', label: 'Status', defaultValue: 'active' },
  ],
  decision: [
    { key: 'title', label: 'Title' },
    { key: 'status', label: 'Status', defaultValue: 'proposed' },
    { key: 'rationale', label: 'Rationale' },
    { key: 'owner', label: 'Owner' },
  ],
  risk: [
    { key: 'title', label: 'Title' },
    { key: 'severity', label: 'Severity', defaultValue: 'medium' },
    { key: 'owner', label: 'Owner' },
    { key: 'mitigation', label: 'Mitigation' },
    { key: 'status', label: 'Status', defaultValue: 'open' },
  ],
  actor: [
    { key: 'name', label: 'Name' },
    { key: 'kind', label: 'Kind', defaultValue: 'person' },
    { key: 'responsibility', label: 'Responsibility' },
  ],
  system: [
    { key: 'name', label: 'Name' },
    { key: 'purpose', label: 'Purpose' },
    { key: 'kind', label: 'Kind', defaultValue: 'service' },
    { key: 'owner', label: 'Owner' },
    { key: 'deploymentUrl', label: 'Deployment URL' },
    { key: 'status', label: 'Status', defaultValue: 'planned' },
  ],
  queue: [
    { key: 'name', label: 'Name' },
    { key: 'kind', label: 'Kind', defaultValue: 'queue' },
    { key: 'delivery', label: 'Delivery', defaultValue: 'at_least_once' },
    { key: 'owner', label: 'Owner' },
    { key: 'notes', label: 'Notes' },
  ],
  event: [
    { key: 'name', label: 'Name' },
    { key: 'version', label: 'Version' },
    { key: 'schemaUrl', label: 'Schema URL' },
    { key: 'owner', label: 'Owner' },
    { key: 'notes', label: 'Notes' },
  ],
  external_system: [
    { key: 'name', label: 'Name' },
    { key: 'vendor', label: 'Vendor' },
    { key: 'purpose', label: 'Purpose' },
    { key: 'contractUrl', label: 'Contract URL' },
    { key: 'owner', label: 'Owner' },
    { key: 'notes', label: 'Notes' },
  ],
  requirement: [
    { key: 'title', label: 'Title' },
    { key: 'priority', label: 'Priority', defaultValue: 'should' },
    { key: 'acceptance', label: 'Acceptance' },
    { key: 'owner', label: 'Owner' },
    { key: 'status', label: 'Status', defaultValue: 'open' },
  ],
  process: [
    { key: 'name', label: 'Name' },
    { key: 'purpose', label: 'Purpose' },
    { key: 'mode', label: 'Mode', defaultValue: 'manual' },
    { key: 'owner', label: 'Owner' },
    { key: 'runbookUrl', label: 'Runbook URL' },
    { key: 'status', label: 'Status', defaultValue: 'planned' },
  ],
  artifact: [
    { key: 'name', label: 'Name' },
    { key: 'kind', label: 'Kind', defaultValue: 'manifest' },
    { key: 'version', label: 'Version' },
    { key: 'uri', label: 'URI' },
    { key: 'digest', label: 'Digest' },
    { key: 'owner', label: 'Owner' },
    { key: 'status', label: 'Status', defaultValue: 'draft' },
    { key: 'schemaMode', label: 'Schema mode', defaultValue: 'none' },
    { key: 'schema', label: 'Schema' },
    { key: 'schemaRef', label: 'Shared schema' },
  ],
  note: [
    { key: 'name', label: 'Name' },
    { key: 'body', label: 'Note' },
  ],
}

const REMOVED_CARD_TARGETS: Record<string, { type: string; kind?: string; noteKind?: string }> = {
  service: { type: 'system', kind: 'service' },
  external_system: { type: 'system', kind: 'external' },
  queue: { type: 'system', kind: 'queue' },
  api: { type: 'system', kind: 'api' },
  database: { type: 'system', kind: 'database' },
  process: { type: 'system', kind: 'job' },
  event: { type: 'schema', kind: 'event' },
  requirement: { type: 'note', noteKind: 'question' },
  decision: { type: 'note', noteKind: 'decision' },
  risk: { type: 'note', noteKind: 'risk' },
}

const RENAMED_FIELDS: Record<string, Record<string, string>> = {
  service: { responsibility: 'purpose' },
  actor: { responsibility: 'purpose' },
  api: { docsUrl: 'url' },
  database: { consoleUrl: 'url' },
  system: { deploymentUrl: 'url' },
  decision: { title: 'name' },
  risk: { title: 'name' },
  requirement: { title: 'name' },
}

const REPLACED_FIELDS: Record<string, Set<string>> = {
  database: new Set(['kind']),
  queue: new Set(['kind']),
}


function stringValue(value: unknown): string {
  return value == null ? '' : String(value).trim()
}

function moveField(
  fields: EntityFields,
  from: string,
  to: string,
  lines: string[],
  label: string,
): void {
  const value = fields[from]
  if (stringValue(value) === '') return
  const current = fields[to]
  if (stringValue(current) === '') {
    fields[to] = value ?? ''
  } else if (stringValue(current) !== stringValue(value)) {
    lines.push(`${label}: ${stringValue(value)}`)
  }
  delete fields[from]
}

function migrateCard(node: CanvasNode): CanvasNode {
  if (!node || typeof node !== 'object') return node
  const app = node.app
  if (!app?.entityType) return node
  const oldType = app.entityType
  const oldFields: EntityFields = { ...(app.fields ?? {}) }
  const fields: EntityFields = { ...oldFields }

  const target = REMOVED_CARD_TARGETS[oldType]
  const entityType = target?.type ?? oldType
  const definition = findEntityType(DEFAULT_ONTOLOGY, entityType)
  if (!definition) return node

  const lines: string[] = []
  const renames = RENAMED_FIELDS[oldType] ?? {}
  for (const [from, to] of Object.entries(renames)) {
    const label = LEGACY_FIELDS[oldType]?.find((field) => field.key === from)?.label ?? from
    moveField(fields, from, to, lines, label)
  }

  if (entityType === 'system') {
    if (target?.kind) {
      fields.kind = target.kind
    } else if (!SYSTEM_KINDS.has(stringValue(fields.kind))) {
      fields.kind = 'service'
    }
  }
  if (entityType === 'note') {
    fields.kind = target?.noteKind ?? 'note'
  }
  if (entityType === 'schema' && oldType === 'event') {
    fields.kind = 'event'
    if (stringValue(fields.version) === '') fields.version = '1'
  }

  const replaced = REPLACED_FIELDS[oldType] ?? new Set<string>()
  const targetKeys = new Set(definition.fields.map((field) => field.key))
  const renamedFrom = new Set(Object.keys(renames))
  for (const field of LEGACY_FIELDS[oldType] ?? []) {
    if (renamedFrom.has(field.key)) continue
    const removed = !targetKeys.has(field.key) || replaced.has(field.key)
    if (!removed) continue
    const value = oldFields[field.key]
    const text = stringValue(value)
    const isDefault = text === stringValue(field.defaultValue) || (field.key === 'status' && text === 'active')
    if (text !== '' && !isDefault) {
      lines.push(`${field.label}: ${text}`)
    }
    if (!targetKeys.has(field.key)) delete fields[field.key]
  }

  for (const key of renamedFrom) delete fields[key]

  const textKey = definition.fields.some((field) => field.key === 'body') ? 'body' : 'purpose'
  let extraTextLines: string[] = []
  if (lines.length > 0) {
    const current = stringValue(fields[textKey])
    fields[textKey] = current ? `${current}\n${lines.join('\n')}` : lines.join('\n')
    if (!definition.fields.some((field) => field.key === textKey)) {
      extraTextLines = lines
    }
  }

  let text = node.type === 'text' ? node.text : ''
  if (node.type === 'text') {
    text = renderEntityMarkdown(definition, fields)
    if (extraTextLines.length > 0) {
      text += `\n${extraTextLines.map((line) => `- **${line.split(':')[0]}:** ${line.slice(line.indexOf(':') + 1).trim()}`).join('\n')}`
    }
  }

  return {
    ...node,
    text,
    app: { ...app, entityType, fields },
  }
}

const REMOVED_RELATION_TYPES = new Set([
  'depends_on',
  'owns',
  'calls',
  'reads_from',
  'writes_to',
  'deploys_to',
  'implements',
  'exposes',
  'publishes',
  'consumes',
  'carries',
  'emits',
  'handles',
  'stores_in',
  'runs',
  'orchestrates',
])

function migrateEdge(edge: CanvasEdge, systems: boolean): CanvasEdge {
  const relation = getEdgeMeta(edge)?.relationType
  if (!relation) return edge

  let mapped = relation
  let swap = false
  if (systems) {
    if (relation === 'describes') {
      mapped = 'defines'
      swap = true
    } else if (relation === 'publishes' || relation === 'emits') {
      mapped = 'produces'
    } else if (REMOVED_RELATION_TYPES.has(relation)) {
      mapped = 'uses'
    }
  }
  if (mapped === relation && !swap) return edge

  const definition = findRelationType(DEFAULT_ONTOLOGY, mapped)
  return {
    ...edge,
    ...(swap
      ? {
        fromNode: edge.toNode,
        toNode: edge.fromNode,
        fromSide: edge.toSide,
        toSide: edge.fromSide,
      }
      : {}),
    label: definition?.label ?? mapped,
    color: definition?.color ?? edge.color,
    app: { ...(edge.app ?? {}), relationType: mapped },
  }
}

export function migrateOntologyCanvas(canvas: JsonCanvas): JsonCanvas {
  const systems = canvas.app?.profile === 'systems'
  return {
    ...canvas,
    nodes: (canvas.nodes ?? []).map(migrateCard),
    edges: (canvas.edges ?? []).map((edge) => migrateEdge(edge, systems)),
    ...(systems
      ? {
        app: {
          ...(canvas.app as NonNullable<JsonCanvas['app']>),
          profileVersion: 5,
        },
      }
      : {}),
  }
}

export function migrateSystemsCanvas(canvas: JsonCanvas): JsonCanvas {
  if (canvas.app?.profile !== 'systems') return canvas
  const edges = (canvas.edges ?? []).map((edge) => migrateEdge(edge, false))
  const nodes = migrateSchemaKinds((canvas.nodes ?? []).map(migrateCard), edges)
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

function migrateDatabaseTargets(canvas: JsonCanvas): JsonCanvas {
  if (canvas.app?.profile !== 'database' || canvas.app.target != null) return canvas

  const nodes = (canvas.nodes ?? []).map((node) => {
    if (node.app?.entityType !== 'table') return node
    const definition = parseTableDefinition(node.app.fields?.definition)
    if (!definition) return node
    let changed = false
    const columns = definition.columns.map((column) => {
      if (column.type.trim().toLowerCase() !== 'timestamp') return column
      changed = true
      return { ...column, type: 'timestamp without time zone' }
    })
    if (!changed) return node
    return {
      ...node,
      app: {
        ...node.app,
        fields: {
          ...(node.app.fields ?? {}),
          definition: stringifyTableDefinition({ ...definition, columns }),
        },
      },
    }
  })

  return {
    ...canvas,
    nodes,
    app: {
      ...canvas.app,
      target: 'postgres',
      profileVersion: 2,
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
  2: (document) => ({
    ...document,
    schemaVersion: 3,
    canvas: migrateOntologyCanvas(document.canvas),
  }),
  3: (document) => ({
    ...document,
    schemaVersion: 4,
    canvas: migrateDatabaseTargets(document.canvas),
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
