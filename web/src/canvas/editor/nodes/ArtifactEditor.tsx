import { useState } from 'react'

import type { EntityFields, EntityTypeDefinition } from '@canvas/contract'

import { useSchemaCards } from '../../schema/schemaCards'
import {
  artifactSchemaMode,
  DEFAULT_EMBEDDED_SCHEMA,
  type ArtifactSchemaMode,
} from '../../schema/embeddedSchema'
import { SchemaWorkbench } from '../schema/SchemaWorkbench'
import { useCanvasEditorActions } from '../CanvasEditorContext'
import { FieldInput } from './FieldInput'

const SCHEMA_KEYS = new Set(['schemaMode', 'schema', 'schemaRef'])

export function ArtifactEditor({
  id,
  entityType,
  fields,
  onChange,
  onOpenSchema,
}: {
  id: string
  entityType: EntityTypeDefinition
  fields: EntityFields
  onChange: (key: string, value: string) => void
  onOpenSchema: (id: string) => void
}) {
  const actions = useCanvasEditorActions()
  const schemas = useSchemaCards()
  const [error, setError] = useState('')
  const mode = artifactSchemaMode(fields)
  const source = String(fields.schema ?? '')
  const schemaRef = String(fields.schemaRef ?? '')
  const selectedCard = schemas.find((schema) => schema.id === schemaRef)
  const standardFields = entityType.fields.filter((field) => !SCHEMA_KEYS.has(field.key))

  function changeMode(next: ArtifactSchemaMode) {
    if (next === mode) return
    setError('')
    if (next === 'none') {
      onChange('schema', '')
      onChange('schemaRef', '')
      onChange('schemaMode', 'none')
      return
    }
    if (next === 'inline') {
      if (!source.trim()) onChange('schema', DEFAULT_EMBEDDED_SCHEMA)
      onChange('schemaRef', '')
      onChange('schemaMode', 'inline')
      return
    }
    onChange('schemaMode', 'shared')
  }

  function extract() {
    const result = actions.extractSchemaCard(id)
    setError(result.ok ? '' : result.error ?? 'Could not extract the schema.')
  }

  function inline() {
    const result = actions.inlineSchemaCard(id)
    setError(result.ok ? '' : result.error ?? 'Could not inline the schema.')
  }

  return (
    <div className="entity-form artifact-form nodrag nopan">
      <section className="artifact-form-section">
        <h3>Artifact</h3>
        <div className="schema-field-grid">
          {standardFields.map((field) => (
            <FieldInput
              key={field.key}
              field={field}
              value={fields[field.key] == null ? '' : String(fields[field.key])}
              onChange={(value) => onChange(field.key, value)}
            />
          ))}
        </div>
      </section>

      <fieldset className="artifact-schema-section">
        <legend>Schema</legend>
        <div className="artifact-schema-modes">
          <label>
            <input type="radio" name={`schema-mode-${id}`} checked={mode === 'none'} onChange={() => changeMode('none')} />
            None
          </label>
          <label>
            <input type="radio" name={`schema-mode-${id}`} checked={mode === 'inline'} onChange={() => changeMode('inline')} />
            Define here
          </label>
          <label>
            <input type="radio" name={`schema-mode-${id}`} checked={mode === 'shared'} onChange={() => changeMode('shared')} />
            Use shared
          </label>
        </div>

        {mode === 'inline' && (
          <>
            <SchemaWorkbench
              source={source}
              schemas={schemas}
              currentSchemaName={String(fields.name ?? '')}
              onChange={(value) => onChange('schema', value)}
            />
            <div className="artifact-schema-actions">
              <button type="button" className="button" onClick={extract}>Extract to shared schema</button>
            </div>
          </>
        )}

        {mode === 'shared' && (
          <div className="artifact-schema-shared">
            <label className="entity-field">
              <span>Shared schema</span>
              <select
                aria-label="Shared schema"
                value={schemaRef}
                onChange={(event) => onChange('schemaRef', event.target.value)}
              >
                <option value="">Choose a Schema card</option>
                {schemas.map((schema) => (
                  <option key={schema.id} value={schema.id}>{schema.name}</option>
                ))}
              </select>
            </label>
            {selectedCard && (
              <button type="button" className="button ghost" onClick={() => onOpenSchema(selectedCard.id)}>Open</button>
            )}
            <button type="button" className="button" onClick={inline} disabled={!selectedCard}>Inline into card</button>
            {schemas.length === 0 && <p className="schema-table-empty">No Schema cards on this canvas.</p>}
          </div>
        )}

        {error && <div className="alert" role="alert">{error}</div>}
      </fieldset>
    </div>
  )
}
