import { Database, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import type { EntityFields, EntityTypeDefinition } from '@canvas/contract'

import { FieldInput } from '../editor/nodes/FieldInput'

export function DatabaseSettingsDialog({
  entityType,
  initialFields,
  onSave,
  onClose,
}: {
  entityType: EntityTypeDefinition
  initialFields: EntityFields
  onSave: (fields: EntityFields) => void
  onClose: () => void
}) {
  const [fields, setFields] = useState<EntityFields>(initialFields)
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
          onSave(fields)
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
