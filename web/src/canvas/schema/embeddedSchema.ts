import { parseFieldModel, type EntityFields } from '@canvas/contract'

import type { SchemaCardSource } from './schemaCards'

export type ArtifactSchemaMode = 'none' | 'inline' | 'shared'

export const DEFAULT_EMBEDDED_SCHEMA = JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {},
  required: [],
}, null, 2)

export function artifactSchemaMode(fields: EntityFields): ArtifactSchemaMode {
  const mode = String(fields.schemaMode ?? '')
  return mode === 'inline' || mode === 'shared' ? mode : 'none'
}

export function artifactSchemaCardName(name: string): string {
  return `${name.trim() || 'Untitled artifact'} schema`
}

export function schemaKindForArtifact(kind: string): string {
  return kind === 'dataset' || kind === 'config' ? kind : 'other'
}

export function extractArtifactSchema(
  fields: EntityFields,
  schemaId: string,
): { artifact: EntityFields; schema: EntityFields } {
  return {
    artifact: {
      ...fields,
      schemaMode: 'shared',
      schema: '',
      schemaRef: schemaId,
    },
    schema: {
      name: artifactSchemaCardName(String(fields.name ?? '')),
      kind: schemaKindForArtifact(String(fields.kind ?? '')),
      version: String(fields.version ?? '').trim() || '1.0.0',
      owner: String(fields.owner ?? ''),
      status: 'draft',
      source: String(fields.schema ?? ''),
    },
  }
}

export function inlineArtifactSchema(fields: EntityFields, source: string): EntityFields {
  return {
    ...fields,
    schemaMode: 'inline',
    schema: source,
    schemaRef: '',
  }
}

export function schemaFieldCount(source: string): number {
  const model = parseFieldModel(source)
  return model.valid ? model.rows.length : 0
}

export function artifactSchemaChip(
  fields: EntityFields,
  schemas: Array<Pick<SchemaCardSource, 'id' | 'name'>>,
): string | undefined {
  const mode = artifactSchemaMode(fields)
  if (mode === 'inline') {
    const count = schemaFieldCount(String(fields.schema ?? ''))
    return `Schema · ${count} ${count === 1 ? 'field' : 'fields'}`
  }
  if (mode === 'shared') {
    const ref = String(fields.schemaRef ?? '')
    const card = schemas.find((schema) => schema.id === ref)
    return `Schema · ${card?.name || 'missing'} (shared)`
  }
  return undefined
}
