import { Boxes, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import type { AddApiResourceInput } from '@canvas/contract'

export function AddResourceDialog({
  initialPrefix,
  onSubmit,
  onClose,
}: {
  initialPrefix: string
  onSubmit: (input: AddApiResourceInput) => string[]
  onClose: () => void
}) {
  const [singular, setSingular] = useState('')
  const [plural, setPlural] = useState('')
  const [pluralEdited, setPluralEdited] = useState(false)
  const [prefix, setPrefix] = useState(initialPrefix)
  const [idParameter, setIdParameter] = useState('')
  const [idEdited, setIdEdited] = useState(false)
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

  function pluralize(value: string): string {
    const singularName = value.trim()
    if (!singularName) return ''
    if (/[^aeiou]y$/i.test(singularName)) return `${singularName.slice(0, -1)}ies`
    if (/(s|x|z|ch|sh)$/i.test(singularName)) return `${singularName}es`
    return `${singularName}s`
  }

  function updateSingular(value: string) {
    setSingular(value)
    if (!pluralEdited) setPlural(pluralize(value))
    if (!idEdited) {
      const singularName = value.trim().split(/[^A-Za-z0-9]+/).filter(Boolean).join('_').toLowerCase()
      setIdParameter(singularName ? `${singularName}_id` : '')
    }
  }

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
        aria-label="Add resource"
        onSubmit={(event) => {
          event.preventDefault()
          const nextErrors = onSubmit({ singular, plural, pathPrefix: prefix, idParameter })
          if (nextErrors.length === 0) onClose()
          else setErrors(nextErrors)
        }}
      >
        <header className="name-dialog-head">
          <div>
            <span className="name-dialog-kicker"><Boxes size={13} /> API</span>
            <h2>Add resource</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close add resource dialog">
            <X size={16} />
          </button>
        </header>

        <div className="add-resource-fields">
          <label className="name-dialog-field">
            Singular
            <input
              ref={inputRef}
              value={singular}
              onChange={(event) => updateSingular(event.target.value)}
              placeholder="project"
              required
            />
          </label>
          <label className="name-dialog-field">
            Plural
            <input
              value={plural}
              onChange={(event) => {
                setPluralEdited(true)
                setPlural(event.target.value)
              }}
              placeholder="projects"
              required
            />
          </label>
          <label className="name-dialog-field">
            Path prefix
            <input
              value={prefix}
              onChange={(event) => setPrefix(event.target.value)}
              placeholder="/v1"
            />
          </label>
          <label className="name-dialog-field">
            Id parameter
            <input
              value={idParameter}
              onChange={(event) => {
                setIdEdited(true)
                setIdParameter(event.target.value)
              }}
              placeholder="project_id"
              required
            />
          </label>
        </div>

        {errors.length > 0 && (
          <div className="alert" role="alert">
            {errors.map((error) => <div key={error}>{error}</div>)}
          </div>
        )}
        {(!singular.trim() || !plural.trim() || !idParameter.trim()) && (
          <p className="add-resource-hint" role="status">
            {[
              !singular.trim() ? 'Enter a singular name.' : '',
              !plural.trim() ? 'Enter a plural name.' : '',
              !idParameter.trim() ? 'Enter an id parameter name.' : '',
            ].filter(Boolean).join(' ')}
          </p>
        )}

        <div className="name-dialog-actions">
          <button type="button" className="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="button primary" disabled={!singular.trim() || !plural.trim() || !idParameter.trim()}>
            Add resource
          </button>
        </div>
      </form>
    </div>
  )
}
