import { Database, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import {
  deepEqual,
  type DatabaseTarget,
  type EntityFields,
  type EntityTypeDefinition,
} from '@canvas/contract'

import { FieldInput } from '../editor/nodes/FieldInput'

const TARGET_HINTS: Record<DatabaseTarget | 'none', string> = {
  none: 'The target sets column types, Review rules, and the export format.',
  postgres: 'PostgreSQL keeps schemas, enums, identity, and its native types; Export writes PostgreSQL DDL.',
  sqlite: 'SQLite flattens schemas, writes enums as TEXT with CHECKs, and exports one STRICT table script.',
  dynamodb: 'DynamoDB export is not available yet.',
}

export function DatabaseSettingsDialog({
  entityType,
  initialFields,
  initialTarget,
  onSave,
  onClose,
}: {
  entityType: EntityTypeDefinition
  initialFields: EntityFields
  initialTarget: DatabaseTarget | undefined
  onSave: (fields: EntityFields, target: DatabaseTarget | undefined, fieldsChanged: boolean) => void
  onClose: () => void
}) {
  const [fields, setFields] = useState<EntityFields>(initialFields)
  const [target, setTarget] = useState<DatabaseTarget | undefined>(initialTarget)
  const formRef = useRef<HTMLFormElement | null>(null)

  useEffect(() => {
    const input = formRef.current?.querySelector<HTMLInputElement>('[data-field-key="name"]')
    input?.focus()
    input?.select()
  }, [])

  // Subscribe once with the latest onClose: re-subscribing on every parent render was flaky in tests.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onCloseRef.current()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])

  return (
    <div
      className="name-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <form
        ref={formRef}
        className="name-dialog database-settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Database settings"
        onSubmit={(event) => {
          event.preventDefault()
          onSave(fields, target, !deepEqual(fields, initialFields))
        }}
      >
        <header className="name-dialog-head">
          <div>
            <span className="name-dialog-kicker"><Database size={13} /> Database</span>
            <h2>Database settings</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close database settings">
            <X size={16} />
          </button>
        </header>

        <div className="database-settings-fields">
          <label className="entity-field">
            <span>Target</span>
            <select
              value={target ?? ''}
              onChange={(event) => setTarget((event.target.value || undefined) as DatabaseTarget | undefined)}
            >
              <option value="">Not chosen</option>
              <option value="postgres">PostgreSQL</option>
              <option value="sqlite">SQLite</option>
              <option value="dynamodb" disabled>DynamoDB (Coming later)</option>
            </select>
          </label>
          <p className="database-editor-hint">{TARGET_HINTS[target ?? 'none']}</p>
          {entityType.fields.map((field) => (
            <FieldInput
              key={field.key}
              field={field}
              value={fields[field.key] == null ? '' : String(fields[field.key])}
              rows={field.key === 'extra' ? 5 : 3}
              readOnly={field.key === 'extra'}
              onChange={(value) => setFields((current) => ({ ...current, [field.key]: value }))}
            />
          ))}
        </div>

        <div className="name-dialog-actions">
          <button type="button" className="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="button primary">Save</button>
        </div>
      </form>
    </div>
  )
}
