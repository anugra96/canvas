import { Plus, Trash2 } from 'lucide-react'

import type { EntityFields } from '@canvas/contract'

import { useApiDesign } from './ApiDesignContext'

type JsonObject = Record<string, unknown>

function value(fields: EntityFields, key: string): string {
  return fields[key] == null ? '' : String(fields[key])
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseExtra(source: string): JsonObject {
  if (!source.trim()) return {}
  try {
    const parsed: unknown = JSON.parse(source)
    return isObject(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

const STATUS_LABELS: Record<string, string> = {
  planned: 'Planned',
  active: 'Active',
  deprecated: 'Deprecated',
}

const REVIEW_LABELS: Record<string, string> = {
  needs_review: 'Needs review',
  approved: 'Approved',
  changes_requested: 'Changes requested',
}

export function ApiDefinitionEditor({
  fields,
  onChange,
}: {
  fields: EntityFields
  onChange: (key: string, value: string) => void
}) {
  const api = useApiDesign()
  const schemeNames = Object.keys(api?.securitySchemes ?? {})
  const extra = parseExtra(value(fields, 'extra'))
  const securityEntries = Array.isArray(extra.security) ? extra.security.filter(isObject) : []
  const selectedSecurity = new Set(securityEntries.flatMap((entry) => Object.keys(entry)))
  const securityScopes = new Map<string, unknown>()
  for (const entry of securityEntries) {
    for (const [name, scopes] of Object.entries(entry)) securityScopes.set(name, scopes)
  }
  const servers = value(fields, 'servers').split(/\r?\n/)

  function updateServer(index: number, next: string) {
    const lines = [...servers]
    lines[index] = next
    onChange('servers', lines.join('\n'))
  }

  function addServer() {
    onChange('servers', [...servers, ''].join('\n'))
  }

  function removeServer(index: number) {
    onChange('servers', servers.filter((_, current) => current !== index).join('\n'))
  }

  function toggleDefaultSecurity(name: string) {
    const selected = new Set(selectedSecurity)
    if (selected.has(name)) selected.delete(name)
    else selected.add(name)
    const nextExtra = { ...extra }
    if (selected.size === 0) {
      delete nextExtra.security
    } else {
      nextExtra.security = schemeNames
        .filter((candidate) => selected.has(candidate))
        .map((candidate) => ({ [candidate]: securityScopes.get(candidate) ?? [] }))
    }
    onChange('extra', JSON.stringify(nextExtra, null, 2))
  }

  return (
    <div className="api-form">
      <section className="api-form-section">
        <h3>Overview</h3>
        <div className="api-form-grid">
          <label className="entity-field">
            <span>Title</span>
            <input value={value(fields, 'title')} onChange={(event) => onChange('title', event.target.value)} />
          </label>
          <label className="entity-field">
            <span>Version</span>
            <input value={value(fields, 'version')} onChange={(event) => onChange('version', event.target.value)} />
          </label>
        </div>
        <label className="entity-field">
          <span>Description</span>
          <textarea rows={3} value={value(fields, 'description')} onChange={(event) => onChange('description', event.target.value)} />
        </label>
        <div className="api-form-servers">
          <div className="api-form-section-head">
            <span>Servers</span>
            <button type="button" className="button ghost" onClick={addServer}><Plus size={13} /> Add server</button>
          </div>
          {servers.map((server, index) => (
            <div className="api-form-server-row" key={index}>
              <input
                aria-label={`Server ${index + 1}`}
                value={server}
                placeholder="https://api.example.com"
                onChange={(event) => updateServer(index, event.target.value)}
              />
              <button type="button" className="icon-button" aria-label={`Remove server ${index + 1}`} onClick={() => removeServer(index)}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="api-form-section">
        <h3>Ownership</h3>
        <div className="api-form-grid">
          <label className="entity-field">
            <span>Owner</span>
            <input value={value(fields, 'owner')} onChange={(event) => onChange('owner', event.target.value)} />
          </label>
          <label className="entity-field">
            <span>Status</span>
            <select value={value(fields, 'status')} onChange={(event) => onChange('status', event.target.value)}>
              {Object.entries(STATUS_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="api-form-section">
        <h3>Review</h3>
        <div className="api-form-grid">
          <label className="entity-field">
            <span>Review status</span>
            <select value={value(fields, 'reviewStatus')} onChange={(event) => onChange('reviewStatus', event.target.value)}>
              {Object.entries(REVIEW_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
          <label className="entity-field">
            <span>Reviewed version</span>
            <input value={value(fields, 'reviewedVersion')} onChange={(event) => onChange('reviewedVersion', event.target.value)} placeholder="1.0.0" />
          </label>
          <label className="entity-field">
            <span>Last reviewed</span>
            <input type="date" value={value(fields, 'lastReviewed')} onChange={(event) => onChange('lastReviewed', event.target.value)} />
          </label>
          <label className="entity-field">
            <span>Review interval</span>
            <input type="number" min={0} value={value(fields, 'reviewIntervalDays')} onChange={(event) => onChange('reviewIntervalDays', event.target.value)} />
          </label>
        </div>
      </section>

      <section className="api-form-section">
        <h3>Default security</h3>
        {schemeNames.length === 0 ? (
          <p className="api-endpoint-muted">Add a Security card first</p>
        ) : (
          <div className="api-endpoint-security-list">
            {schemeNames.map((name) => (
              <label key={name} className="api-endpoint-security-choice">
                <input
                  type="checkbox"
                  checked={selectedSecurity.has(name)}
                  onChange={() => toggleDefaultSecurity(name)}
                />
                Default security {name}
              </label>
            ))}
          </div>
        )}
      </section>

      <details className="api-form-advanced">
        <summary>Advanced</summary>
        <label className="entity-field">
          <span>Extra</span>
          <textarea rows={8} value={value(fields, 'extra')} readOnly spellCheck={false} />
        </label>
      </details>
    </div>
  )
}
