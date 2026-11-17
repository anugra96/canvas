import { Table2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import type { AddDatabaseTableInput, DatabaseTableIdType } from '@canvas/contract'

export function AddTableDialog({
  schemas,
  onSubmit,
  onClose,
}: {
  schemas: string[]
  onSubmit: (input: AddDatabaseTableInput) => string[]
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [schema, setSchema] = useState('public')
  const [idType, setIdType] = useState<DatabaseTableIdType>('uuid')
  const [errors, setErrors] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])

  return (
    <div
      className="name-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <form
        className="name-dialog add-resource-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Add table"
        onSubmit={(event) => {
          event.preventDefault()
          const nextErrors = onSubmit({ name, schema, idType })
          if (nextErrors.length === 0) onClose()
          else setErrors(nextErrors)
        }}
      >
        <header className="name-dialog-head">
          <div>
            <span className="name-dialog-kicker"><Table2 size={13} /> Database</span>
            <h2>Add table</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close add table dialog">
            <X size={16} />
          </button>
        </header>

        <div className="add-resource-fields">
          <label className="name-dialog-field">
            Table name
            <input
              ref={inputRef}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="project"
              required
            />
          </label>
          <label className="name-dialog-field">
            Schema
            <input
              value={schema}
              onChange={(event) => setSchema(event.target.value)}
              list="add-table-schema-suggestions"
              placeholder="public"
              required
            />
          </label>
          <datalist id="add-table-schema-suggestions">
            {schemas.map((item) => <option key={item} value={item} />)}
          </datalist>
          <label className="name-dialog-field">
            Id column
            <select value={idType} onChange={(event) => setIdType(event.target.value as DatabaseTableIdType)}>
              <option value="uuid">uuid default gen_random_uuid()</option>
              <option value="bigint">bigint identity</option>
            </select>
          </label>
        </div>

        {errors.length > 0 && (
          <div className="alert" role="alert">
            {errors.map((error) => <div key={error}>{error}</div>)}
          </div>
        )}

        <div className="name-dialog-actions">
          <button type="button" className="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="button primary" disabled={!name.trim() || !schema.trim()}>
            Add table
          </button>
        </div>
      </form>
    </div>
  )
}
