import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { schemaNameFromRef, type EntityFields } from '@canvas/contract'

type JsonObject = Record<string, unknown>

function object(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {}
}

function parseOperation(source: string): JsonObject {
  try {
    const value: unknown = JSON.parse(source || '{}')
    return object(value)
  } catch {
    return {}
  }
}

function string(value: unknown): string {
  return value == null ? '' : String(value)
}

function parameterType(parameter: JsonObject): string {
  const schema = object(parameter.schema)
  return string(schema.type) || string(schema.format) || 'string'
}

function pathParameters(path: string): string[] {
  return [...path.matchAll(/\{([^}]+)\}/g)].flatMap((match) => match[1] ? [match[1]] : [])
}

export function ApiEndpointEditor({
  fields,
  onChange,
}: {
  fields: EntityFields
  onChange: (key: string, value: string) => void
}) {
  const [tab, setTab] = useState<'details' | 'raw'>('details')
  const source = string(fields.operation)
  const operation = parseOperation(source)
  const path = string(fields.path)
  const parameters = Array.isArray(operation.parameters) ? operation.parameters.map(object) : []
  const responses = object(operation.responses)
  const declaredPath = new Set(parameters.filter((parameter) => parameter.in === 'path').map((parameter) => string(parameter.name)))
  const missingPath = pathParameters(path).filter((name) => !declaredPath.has(name))

  function updateOperation(next: JsonObject) {
    onChange('operation', JSON.stringify(next, null, 2))
  }

  function updateParameter(index: number, patch: JsonObject) {
    const next = parameters.map((parameter, current) => current === index ? { ...parameter, ...patch } : parameter)
    updateOperation({ ...operation, parameters: next })
  }

  function addMissingPathParameter(name: string) {
    updateOperation({
      ...operation,
      parameters: [
        ...parameters,
        { name, in: 'path', required: true, schema: { type: 'string' } },
      ],
    })
  }

  function addParameter() {
    updateOperation({
      ...operation,
      parameters: [...parameters, { name: 'parameter', in: 'query', required: false, schema: { type: 'string' } }],
    })
  }

  function removeParameter(index: number) {
    updateOperation({ ...operation, parameters: parameters.filter((_, current) => current !== index) })
  }

  function addResponse() {
    updateOperation({ ...operation, responses: { ...responses, '200': { description: 'Success' } } })
  }

  function updateResponse(status: string, patch: JsonObject) {
    updateOperation({ ...operation, responses: { ...responses, [status]: { ...object(responses[status]), ...patch } } })
  }

  function removeResponse(status: string) {
    const next = { ...responses }
    delete next[status]
    updateOperation({ ...operation, responses: next })
  }

  const requestContent = object(object(operation.requestBody).content)
  const requestModels = [...new Set(Object.values(requestContent).flatMap((media) => {
    const name = schemaNameFromRef(object(object(media).schema).$ref)
    return name ? [name] : []
  }))]

  return (
    <div className="api-endpoint-editor">
      <div className="api-endpoint-tabs" role="tablist" aria-label="Endpoint editor">
        <button role="tab" aria-selected={tab === 'details'} className={tab === 'details' ? 'active' : ''} onClick={() => setTab('details')}>Details</button>
        <button role="tab" aria-selected={tab === 'raw'} className={tab === 'raw' ? 'active' : ''} onClick={() => setTab('raw')}>Raw</button>
      </div>

      <div className="api-endpoint-fields">
        <label className="entity-field">
          <span>Method</span>
          <select value={string(fields.method)} onChange={(event) => onChange('method', event.target.value)}>
            {['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE'].map((method) => (
              <option key={method} value={method}>{method}</option>
            ))}
          </select>
        </label>
        <label className="entity-field">
          <span>Path</span>
          <input value={path} onChange={(event) => onChange('path', event.target.value)} />
        </label>
        <label className="entity-field">
          <span>Status</span>
          <select value={string(fields.status)} onChange={(event) => onChange('status', event.target.value)}>
            {['planned', 'active', 'deprecated'].map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </label>
      </div>

      {tab === 'raw' ? (
        <label className="entity-field api-endpoint-raw">
          <span>Operation JSON</span>
          <textarea rows={18} value={source} onChange={(event) => onChange('operation', event.target.value)} spellCheck={false} />
        </label>
      ) : (
        <>
          <label className="entity-field">
            <span>Summary</span>
            <input value={string(operation.summary)} onChange={(event) => updateOperation({ ...operation, summary: event.target.value })} />
          </label>
          <label className="entity-field">
            <span>Description</span>
            <textarea rows={3} value={string(operation.description)} onChange={(event) => updateOperation({ ...operation, description: event.target.value })} />
          </label>

          <section className="api-endpoint-section">
            <div className="api-endpoint-section-head">
              <h3>Parameters</h3>
              <button type="button" className="button ghost" onClick={addParameter}><Plus size={14} /> Add</button>
            </div>
            <table className="api-endpoint-table">
              <thead><tr><th>Name</th><th>In</th><th>Required</th><th>Type</th><th>Description</th><th /></tr></thead>
              <tbody>
                {parameters.map((parameter, index) => (
                  <tr key={`${string(parameter.in)}:${string(parameter.name)}:${index}`}>
                    <td><input aria-label="Parameter name" value={string(parameter.name)} onChange={(event) => updateParameter(index, { name: event.target.value })} /></td>
                    <td><input aria-label="Parameter location" value={string(parameter.in)} onChange={(event) => updateParameter(index, { in: event.target.value })} /></td>
                    <td><input aria-label="Parameter required" type="checkbox" checked={parameter.required === true} onChange={(event) => updateParameter(index, { required: event.target.checked })} /></td>
                    <td><input aria-label="Parameter type" value={parameterType(parameter)} onChange={(event) => updateParameter(index, { schema: { ...object(parameter.schema), type: event.target.value } })} /></td>
                    <td><input aria-label="Parameter description" value={string(parameter.description)} onChange={(event) => updateParameter(index, { description: event.target.value })} /></td>
                    <td><button type="button" className="icon-button" aria-label="Remove parameter" onClick={() => removeParameter(index)}><Trash2 size={13} /></button></td>
                  </tr>
                ))}
                {missingPath.map((name) => (
                  <tr key={`missing:${name}`} className="api-endpoint-missing">
                    <td>{name}</td><td>path</td><td>required</td><td>string</td><td>Detected from path</td>
                    <td><button type="button" className="button ghost" onClick={() => addMissingPathParameter(name)}>Add</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="api-endpoint-section">
            <h3>Request body</h3>
            {Object.keys(requestContent).length === 0 ? (
              <p className="api-endpoint-muted">No request body.</p>
            ) : Object.entries(requestContent).map(([mediaType, media]) => (
              <div className="api-endpoint-model-row" key={mediaType}>
                <code>{mediaType}</code>
                <span>{schemaNameFromRef(object(object(media).schema).$ref) ?? 'Inline schema'}</span>
              </div>
            ))}
            {requestModels.length > 1 && <p className="api-endpoint-muted">Multiple models share this body. Edit Raw for exact control.</p>}
          </section>

          <section className="api-endpoint-section">
            <div className="api-endpoint-section-head">
              <h3>Responses</h3>
              <button type="button" className="button ghost" onClick={addResponse}><Plus size={14} /> Add response</button>
            </div>
            {Object.entries(responses).map(([status, response]) => {
              const body = object(response)
              const model = [...new Set(Object.values(object(body.content)).flatMap((media) => {
                const name = schemaNameFromRef(object(object(media).schema).$ref)
                return name ? [name] : []
              }))]
              return (
                <div className="api-endpoint-response-row" key={status}>
                  <input aria-label="Response status" value={status} onChange={(event) => {
                    const next = { ...responses }
                    next[event.target.value] = response
                    delete next[status]
                    updateOperation({ ...operation, responses: next })
                  }} />
                  <input aria-label="Response description" value={string(body.description)} onChange={(event) => updateResponse(status, { description: event.target.value })} />
                  <span>{model.join(', ') || 'No model'}</span>
                  <button type="button" className="icon-button" aria-label={`Remove response ${status}`} onClick={() => removeResponse(status)}><Trash2 size={13} /></button>
                </div>
              )
            })}
          </section>

          <section className="api-endpoint-section">
            <h3>Security</h3>
            <p className="api-endpoint-muted">
              {Array.isArray(operation.security)
                ? operation.security.map((entry) => Object.keys(object(entry)).join(', ')).filter(Boolean).join(' · ') || 'Public endpoint'
                : 'Inherits API-level security.'}
            </p>
          </section>
        </>
      )}
    </div>
  )
}
