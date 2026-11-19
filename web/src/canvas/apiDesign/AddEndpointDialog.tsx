import { Workflow, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import type { AddApiEndpointInput, ApiReferenceResource } from '@canvas/contract'

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const

function resourcePath(resource: { name: string; endpoints: Array<{ path: string }> }): string {
  const paths = resource.endpoints.map((endpoint) => endpoint.path).filter(Boolean)
  const shortest = [...paths].sort((left, right) => (
    left.split('/').filter(Boolean).length - right.split('/').filter(Boolean).length
    || left.length - right.length
    || left.localeCompare(right)
  ))[0]
  return shortest ?? `/${resource.name}`
}

export function AddEndpointDialog({
  resources,
  initialResourceId,
  onSubmit,
  onClose,
}: {
  resources: ApiReferenceResource[]
  initialResourceId?: string
  onSubmit: (input: AddApiEndpointInput) => string[]
  onClose: () => void
}) {
  const initial = useMemo(() => (
    resources.find((resource) => resource.id === initialResourceId) ?? resources[0]
  ), [initialResourceId, resources])
  const [resourceId, setResourceId] = useState(initial?.id ?? '')
  const [method, setMethod] = useState<string>('GET')
  const [path, setPath] = useState(() => (initial ? resourcePath(initial) : ''))
  const [pathEdited, setPathEdited] = useState(false)
  const [summary, setSummary] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const inputRef = useRef<HTMLSelectElement>(null)

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

  function chooseResource(nextId: string) {
    setResourceId(nextId)
    if (pathEdited) return
    const resource = resources.find((candidate) => candidate.id === nextId)
    if (resource) setPath(resourcePath(resource))
  }

  return (
    <div
      className="name-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <form
        className="name-dialog add-endpoint-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Add endpoint"
        onSubmit={(event) => {
          event.preventDefault()
          const nextErrors = onSubmit({ resourceId, method, path, summary })
          if (nextErrors.length === 0) onClose()
          else setErrors(nextErrors)
        }}
      >
        <header className="name-dialog-head">
          <div>
            <span className="name-dialog-kicker"><Workflow size={13} /> API</span>
            <h2>Add endpoint</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close add endpoint dialog">
            <X size={16} />
          </button>
        </header>

        <div className="add-resource-fields">
          <label className="name-dialog-field">
            Resource
            <select
              ref={inputRef}
              aria-label="Resource"
              value={resourceId}
              onChange={(event) => chooseResource(event.target.value)}
              required
            >
              {resources.map((resource) => (
                <option key={resource.id} value={resource.id}>{resource.name}</option>
              ))}
            </select>
          </label>
          <label className="name-dialog-field">
            Method
            <select aria-label="Method" value={method} onChange={(event) => setMethod(event.target.value)}>
              {METHODS.map((candidate) => <option key={candidate} value={candidate}>{candidate}</option>)}
            </select>
          </label>
          <label className="name-dialog-field">
            Path
            <input
              value={path}
              onChange={(event) => {
                setPathEdited(true)
                setPath(event.target.value)
              }}
              placeholder="/tasks"
              required
            />
          </label>
          <label className="name-dialog-field">
            Summary
            <input
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              placeholder="List task history"
            />
          </label>
        </div>

        {errors.length > 0 && (
          <div className="alert" role="alert">
            {errors.map((error) => <div key={error}>{error}</div>)}
          </div>
        )}

        <div className="name-dialog-actions">
          <button type="button" className="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="button primary" disabled={!resourceId || !path.trim()}>
            Add endpoint
          </button>
        </div>
      </form>
    </div>
  )
}
