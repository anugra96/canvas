import { Copy, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useState } from 'react'

import {
  buildCurlSnippet,
  generateExample,
  schemaNameFromRef,
  type EntityFields,
} from '@canvas/contract'
import { useApiDesign } from './ApiDesignContext'

type JsonObject = Record<string, unknown>

function object(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {}
}

function parseOperation(source: string): { value: JsonObject; error?: string } {
  if (!source.trim()) return { value: {}, error: 'Operation JSON is empty.' }
  try {
    const value: unknown = JSON.parse(source)
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { value: {}, error: 'Operation JSON must be an object.' }
    }
    return { value: value as JsonObject }
  } catch (cause) {
    return {
      value: {},
      error: cause instanceof Error ? cause.message : 'Operation JSON is invalid.',
    }
  }
}

const RESPONSE_CODES = [200, 201, 204, 400, 401, 403, 404, 409, 422, 500]

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

function modelNames(media: JsonObject): string[] {
  const schema = object(media.schema)
  const name = schemaNameFromRef(schema.$ref)
  if (name) return [name]
  if (Array.isArray(schema.items)) return []
  const item = schemaNameFromRef(object(schema.items).$ref)
  return item ? [item] : []
}

export function ApiEndpointEditor({
  fields,
  onChange,
}: {
  fields: EntityFields
  onChange: (key: string, value: string) => void
}) {
  const [tab, setTab] = useState<'details' | 'raw'>('details')
  const [statusDrafts, setStatusDrafts] = useState<Record<string, string>>({})
  const [statusError, setStatusError] = useState('')
  const [copyStatus, setCopyStatus] = useState('')
  const api = useApiDesign()
  const source = string(fields.operation)
  const parsed = parseOperation(source)
  const operation = parsed.value
  const invalid = Boolean(parsed.error)
  const path = string(fields.path)
  const parameters = Array.isArray(operation.parameters) ? operation.parameters.map(object) : []
  const responses = object(operation.responses)
  const declaredPath = new Set(parameters.filter((parameter) => parameter.in === 'path').map((parameter) => string(parameter.name)))
  const missingPath = pathParameters(path).filter((name) => !declaredPath.has(name))
  const requestContent = object(object(operation.requestBody).content)
  const requestModels = [...new Set(Object.values(requestContent).flatMap((media) => modelNames(object(media))))]

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
    const status = RESPONSE_CODES.find((code) => !(String(code) in responses))
    if (!status) return
    updateOperation({ ...operation, responses: { ...responses, [String(status)]: { description: 'Success' } } })
  }

  function commitStatus(status: string) {
    const next = (statusDrafts[status] ?? status).trim().toUpperCase()
    setStatusError('')
    if (!next) {
      setStatusDrafts((current) => ({ ...current, [status]: status }))
      setStatusError('Response status is required.')
      return
    }
    if (!/^[1-5](\d\d|XX)$/.test(next)) {
      setStatusDrafts((current) => ({ ...current, [status]: status }))
      setStatusError(`Response status "${next}" is not valid.`)
      return
    }
    if (next === status) {
      setStatusDrafts((current) => ({ ...current, [status]: status }))
      return
    }
    if (Object.hasOwn(responses, next)) {
      setStatusDrafts((current) => ({ ...current, [status]: status }))
      setStatusError(`Response status ${next} already exists.`)
      return
    }
    const renamed: JsonObject = {}
    for (const [key, value] of Object.entries(responses)) {
      renamed[key === status ? next : key] = value
    }
    setStatusDrafts((current) => ({ ...current, [status]: next }))
    updateOperation({ ...operation, responses: renamed })
  }

  function updateResponse(status: string, patch: JsonObject) {
    updateOperation({ ...operation, responses: { ...responses, [status]: { ...object(responses[status]), ...patch } } })
  }

  function removeResponse(status: string) {
    const next = { ...responses }
    delete next[status]
    updateOperation({ ...operation, responses: next })
  }

  function generateRequestExample(mediaType: string) {
    const media = object(requestContent[mediaType])
    if (!media.schema) return
    const example = generateExample(media.schema, api?.schemaSources ?? {})
    updateOperation({
      ...operation,
      requestBody: {
        ...object(operation.requestBody),
        content: {
          ...requestContent,
          [mediaType]: { ...media, example },
        },
      },
    })
  }

  function generateResponseExample(status: string) {
    const response = object(responses[status])
    const content = object(response.content)
    const [mediaType, media] = Object.entries(content)[0] ?? []
    const body = object(media)
    if (!mediaType || !body.schema) return
    updateResponse(status, {
      content: {
        ...content,
        [mediaType]: { ...body, example: generateExample(body.schema, api?.schemaSources ?? {}) },
      },
    })
  }

  function copyCurl() {
    if (!api) return
    const snippet = buildCurlSnippet({
      method: string(fields.method),
      path,
      operation,
      servers: api.summary.servers,
      globalSecurity: api.summary.globalSecurity,
      securitySchemes: api.securitySchemes,
    })
    void navigator.clipboard.writeText(snippet)
      .then(() => setCopyStatus('Copied'))
      .catch(() => setCopyStatus('Clipboard denied'))
  }

  return (
    <div className="api-endpoint-editor">
      <div className="api-endpoint-tabs" role="tablist" aria-label="Endpoint editor">
        <button role="tab" aria-selected={tab === 'details'} className={tab === 'details' ? 'active' : ''} disabled={invalid} onClick={() => setTab('details')}>Details</button>
        <button role="tab" aria-selected={tab === 'raw'} className={tab === 'raw' ? 'active' : ''} onClick={() => setTab('raw')}>Raw</button>
      </div>

      {invalid && (
        <div className="alert" role="alert">Operation JSON is invalid: {parsed.error} Fix it in the Raw tab.</div>
      )}

      {!invalid && (
        <div className="api-endpoint-tools">
          <button type="button" className="button ghost" onClick={copyCurl} disabled={!api}>
            <Copy size={14} /> Copy curl
          </button>
          {copyStatus && <span className="api-endpoint-muted" role="status">{copyStatus}</span>}
        </div>
      )}

      {tab === 'raw' ? (
        <label className="entity-field api-endpoint-raw">
          <span>Operation JSON</span>
          <textarea rows={18} value={source} onChange={(event) => onChange('operation', event.target.value)} spellCheck={false} />
        </label>
      ) : !invalid && (
        <>
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
                <span>{modelNames(object(media)).join(', ') || 'Inline schema'}</span>
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => generateRequestExample(mediaType)}
                  disabled={!object(media).schema}
                >
                  <Sparkles size={13} /> Generate example
                </button>
              </div>
            ))}
            {requestModels.length > 1 && <p className="api-endpoint-muted">Multiple models share this body. Edit Raw for exact control.</p>}
          </section>

          <section className="api-endpoint-section">
            <div className="api-endpoint-section-head">
              <h3>Responses</h3>
              <button type="button" className="button ghost" onClick={addResponse}><Plus size={14} /> Add response</button>
            </div>
            {statusError && <p className="api-endpoint-error" role="alert">{statusError}</p>}
            {Object.entries(responses).map(([status, response]) => {
              const body = object(response)
              const model = [...new Set(Object.values(object(body.content)).flatMap((media) => modelNames(object(media))))]
              return (
                <div className="api-endpoint-response-row" key={status}>
                  <input
                    aria-label="Response status"
                    value={statusDrafts[status] ?? status}
                    onChange={(event) => {
                      setStatusDrafts((current) => ({ ...current, [status]: event.target.value }))
                      setStatusError('')
                    }}
                    onBlur={() => commitStatus(status)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        commitStatus(status)
                      } else if (event.key === 'Escape') {
                        setStatusDrafts((current) => ({ ...current, [status]: status }))
                        setStatusError('')
                      }
                    }}
                  />
                  <input aria-label="Response description" value={string(body.description)} onChange={(event) => updateResponse(status, { description: event.target.value })} />
                  <span>{model.join(', ') || 'No model'}</span>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Generate example for response ${status}`}
                    title={`Generate example for response ${status}`}
                    onClick={() => generateResponseExample(status)}
                    disabled={Object.values(object(body.content)).every((media) => !object(media).schema)}
                  ><Sparkles size={13} /></button>
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
