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

function string(value: unknown): string {
  return value == null ? '' : String(value)
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
const IN_OPTIONS = ['path', 'query', 'header', 'cookie']
const TYPE_OPTIONS = ['string', 'integer', 'number', 'boolean', 'array', 'object']
const FORMAT_OPTIONS = ['', 'date-time', 'date', 'uuid', 'email', 'uri', 'int32', 'int64', 'float', 'double', 'byte', 'binary', 'password']

function pathParameters(path: string): string[] {
  return [...path.matchAll(/\{([^}]+)\}/g)].flatMap((match) => match[1] ? [match[1]] : [])
}

function modelNames(media: JsonObject): string[] {
  const schema = object(media.schema)
  const name = schemaNameFromRef(schema.$ref)
  if (name) return [name]
  const item = schemaNameFromRef(object(schema.items).$ref)
  return item ? [item] : []
}

export function EndpointCopyCurlButton({ fields }: { fields: EntityFields }) {
  const api = useApiDesign()
  const [status, setStatus] = useState('')
  const parsed = parseOperation(string(fields.operation))

  function copy() {
    if (!api || parsed.error) return
    const snippet = buildCurlSnippet({
      method: string(fields.method),
      path: string(fields.path),
      operation: parsed.value,
      servers: api.summary.servers,
      globalSecurity: api.summary.globalSecurity,
      securitySchemes: api.securitySchemes,
    })
    void navigator.clipboard.writeText(snippet)
      .then(() => setStatus('Copied'))
      .catch(() => setStatus('Clipboard denied'))
  }

  return (
    <span className="endpoint-header-action">
      <button type="button" className="button ghost" onClick={copy} disabled={!api || Boolean(parsed.error)}>
        <Copy size={14} /> Copy curl
      </button>
      {status && <span className="api-endpoint-muted" role="status">{status}</span>}
    </span>
  )
}

export function ApiEndpointEditor({
  fields,
  onChange,
}: {
  fields: EntityFields
  onChange: (key: string, value: string) => void
}) {
  const api = useApiDesign()
  const [tab, setTab] = useState<'details' | 'raw'>('details')
  const [statusDrafts, setStatusDrafts] = useState<Record<string, string>>({})
  const [statusError, setStatusError] = useState('')
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
  const requestEntries = Object.entries(requestContent)
  const requestMediaType = requestEntries[0]?.[0] ?? 'application/json'
  const requestMedia = object(requestEntries[0]?.[1])
  const requestRef = schemaNameFromRef(object(requestMedia.schema).$ref)
  const requestMode = requestEntries.length === 0 ? 'none' : requestRef ? 'model' : 'inline'
  const schemaNames = Object.keys(api?.schemaSources ?? {}).sort((left, right) => left.localeCompare(right))
  const requestExamples = Object.entries(requestContent).flatMap(([mediaType, media]) => {
    const value = object(media)
    return 'example' in value ? [{ mediaType, example: value.example }] : []
  })
  const securitySelectable = Boolean(api && Object.keys(api.securitySchemes).length > 0)
  const securityRequirements = Array.isArray(operation.security) ? operation.security.map(object) : []
  const selectedSchemes = securityRequirements.flatMap((requirement) => Object.keys(requirement))
  const securityScopes = Object.fromEntries(securityRequirements.flatMap((requirement) => Object.entries(requirement)))
  const securityMode = !Array.isArray(operation.security)
    ? 'inherit'
    : selectedSchemes.length === 0 ? 'public' : 'schemes'

  function updateOperation(next: JsonObject) {
    onChange('operation', JSON.stringify(next, null, 2))
  }

  function updateParameter(index: number, patch: JsonObject) {
    const next = parameters.map((parameter, current) => {
      if (current !== index) return parameter
      const updated = { ...parameter, ...patch }
      if (updated.in === 'path') updated.required = true
      return updated
    })
    updateOperation({ ...operation, parameters: next })
  }

  function addMissingPathParameter(name: string) {
    updateOperation({
      ...operation,
      parameters: [...parameters, { name, in: 'path', required: true, schema: { type: 'string' } }],
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

  function setResponse(status: string, body: JsonObject) {
    updateOperation({ ...operation, responses: { ...responses, [status]: body } })
  }

  function updateResponse(status: string, patch: JsonObject) {
    setResponse(status, { ...object(responses[status]), ...patch })
  }

  function removeResponse(status: string) {
    const next = { ...responses }
    delete next[status]
    updateOperation({ ...operation, responses: next })
  }

  function updateResponseModel(status: string, modelName: string) {
    const body = object(responses[status])
    const content = object(body.content)
    const mediaType = Object.keys(content)[0] ?? 'application/json'
    const media = object(content[mediaType])
    const nextContent = { ...content }
    if (modelName) nextContent[mediaType] = { ...media, schema: { $ref: `#/components/schemas/${modelName}` } }
    else delete nextContent[mediaType]
    const nextBody = { ...body }
    if (Object.keys(nextContent).length > 0) nextBody.content = nextContent
    else delete nextBody.content
    setResponse(status, nextBody)
  }

  function generateRequestExample() {
    const found = Object.entries(requestContent).find(([, media]) => object(media).schema)
    if (!found) return
    const [mediaType, media] = found
    updateOperation({
      ...operation,
      requestBody: {
        ...object(operation.requestBody),
        content: {
          ...requestContent,
          [mediaType]: {
            ...object(media),
            example: generateExample(object(media).schema, api?.schemaSources ?? {}),
          },
        },
      },
    })
  }

  function generateResponseExample(status: string) {
    const body = object(responses[status])
    const content = object(body.content)
    const found = Object.entries(content).find(([, media]) => object(media).schema)
    if (!found) return
    const [mediaType, media] = found
    const example = generateExample(object(media).schema, api?.schemaSources ?? {})
    setResponse(status, {
      ...body,
      content: {
        ...content,
        [mediaType]: { ...object(media), example },
      },
    })
  }

  function setRequestMediaType(nextType: string) {
    if (!nextType || nextType === requestMediaType) return
    const entries = Object.entries(requestContent)
    const rest = entries.slice(1)
    const nextContent = Object.fromEntries([
      [nextType, entries[0]?.[1] ?? { schema: { type: 'object' } }],
      ...rest,
    ])
    updateOperation({
      ...operation,
      requestBody: { ...object(operation.requestBody), content: nextContent },
    })
  }

  function setRequestMode(mode: string) {
    if (mode === 'none') {
      const next = { ...operation }
      delete next.requestBody
      updateOperation(next)
      return
    }
    if (mode === 'model') {
      const model = requestRef || schemaNames[0]
      if (!model) return
      updateOperation({
        ...operation,
        requestBody: {
          ...object(operation.requestBody),
          required: true,
          content: {
            ...requestContent,
            [requestMediaType]: { ...requestMedia, schema: { $ref: `#/components/schemas/${model}` } },
          },
        },
      })
      return
    }
    updateOperation({
      ...operation,
      requestBody: {
        ...object(operation.requestBody),
        content: {
          ...requestContent,
          [requestMediaType]: {
            ...requestMedia,
            schema: requestRef ? { type: 'object' } : object(requestMedia.schema).$ref ? { type: 'object' } : requestMedia.schema ?? { type: 'object' },
          },
        },
      },
    })
  }

  function setRequestModel(modelName: string) {
    updateOperation({
      ...operation,
      requestBody: {
        ...object(operation.requestBody),
        required: true,
        content: {
          ...requestContent,
          [requestMediaType]: { ...requestMedia, schema: { $ref: `#/components/schemas/${modelName}` } },
        },
      },
    })
  }

  function setSecurityMode(mode: string) {
    if (mode === 'inherit') {
      const next = { ...operation }
      delete next.security
      updateOperation(next)
      return
    }
    if (mode === 'public') {
      updateOperation({ ...operation, security: [] })
      return
    }
    const names = selectedSchemes.length > 0
      ? selectedSchemes
      : [Object.keys(api?.securitySchemes ?? {})[0]].filter((name): name is string => Boolean(name))
    updateOperation({
      ...operation,
      security: names.map((name) => ({ [name]: securityScopes[name] ?? [] })),
    })
  }

  function toggleSecurity(name: string) {
    const next = selectedSchemes.includes(name)
      ? selectedSchemes.filter((scheme) => scheme !== name)
      : [...selectedSchemes, name]
    updateOperation({
      ...operation,
      security: next.map((scheme) => ({ [scheme]: securityScopes[scheme] ?? [] })),
    })
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

      {tab === 'raw' ? (
        <label className="entity-field api-endpoint-raw">
          <span>Operation JSON</span>
          <textarea rows={18} value={source} onChange={(event) => onChange('operation', event.target.value)} spellCheck={false} />
        </label>
      ) : !invalid && (
        <>
          <section className="api-form-section">
            <h3>Basics</h3>
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
                  <option value="planned">Planned</option>
                  <option value="active">Active</option>
                  <option value="deprecated">Deprecated</option>
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
          </section>

          <section className="api-endpoint-section">
            <div className="api-endpoint-section-head">
              <h3>Parameters</h3>
              <button type="button" className="button ghost" onClick={addParameter}><Plus size={14} /> Add</button>
            </div>
            <table className="api-endpoint-table">
              <thead><tr><th>Name</th><th>In</th><th>Required</th><th>Type</th><th>Format</th><th>Description</th><th /></tr></thead>
              <tbody>
                {parameters.map((parameter, index) => {
                  const schema = object(parameter.schema)
                  const isPath = parameter.in === 'path'
                  return (
                    <tr key={`${string(parameter.in)}:${string(parameter.name)}:${index}`}>
                      <td><input aria-label={`Parameter ${index + 1} name`} value={string(parameter.name)} onChange={(event) => updateParameter(index, { name: event.target.value })} /></td>
                      <td>
                        <select aria-label={`Parameter ${index + 1} location`} value={string(parameter.in)} onChange={(event) => updateParameter(index, { in: event.target.value })}>
                          {IN_OPTIONS.map((option) => <option key={option} value={option}>{option[0]?.toUpperCase() + option.slice(1)}</option>)}
                        </select>
                      </td>
                      <td><input aria-label={`Parameter ${index + 1} required`} type="checkbox" checked={isPath || parameter.required === true} disabled={isPath} onChange={(event) => updateParameter(index, { required: event.target.checked })} /></td>
                      <td>
                        <select aria-label={`Parameter ${index + 1} type`} value={string(schema.type) || 'string'} onChange={(event) => updateParameter(index, { schema: { ...schema, type: event.target.value } })}>
                          {TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option[0]?.toUpperCase() + option.slice(1)}</option>)}
                        </select>
                      </td>
                      <td>
                        <select
                          aria-label={`Parameter ${index + 1} format`}
                          value={string(schema.format)}
                          onChange={(event) => {
                            const nextSchema = { ...schema }
                            if (event.target.value) nextSchema.format = event.target.value
                            else delete nextSchema.format
                            updateParameter(index, { schema: nextSchema })
                          }}
                        >
                          {FORMAT_OPTIONS.map((option) => <option key={option || 'none'} value={option}>{option || 'None'}</option>)}
                        </select>
                      </td>
                      <td><input aria-label={`Parameter ${index + 1} description`} value={string(parameter.description)} onChange={(event) => updateParameter(index, { description: event.target.value })} /></td>
                      <td><button type="button" className="icon-button" aria-label={`Remove parameter ${index + 1}`} onClick={() => removeParameter(index)}><Trash2 size={13} /></button></td>
                    </tr>
                  )
                })}
                {missingPath.map((name) => (
                  <tr key={`missing:${name}`} className="api-endpoint-missing">
                    <td>{name}</td><td>Path</td><td>required</td><td>String</td><td>None</td><td>Detected from path</td>
                    <td><button type="button" className="button ghost" onClick={() => addMissingPathParameter(name)}>Add</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="api-endpoint-section">
            <h3>Request body</h3>
            <div className="api-endpoint-body-grid">
              <label className="entity-field">
                <span>Body</span>
                <select value={requestMode} onChange={(event) => setRequestMode(event.target.value)}>
                  <option value="none">None</option>
                  <option value="model">Schema card</option>
                  <option value="inline">Inline</option>
                </select>
              </label>
              {requestMode !== 'none' && (
                <label className="entity-field">
                  <span>Media type</span>
                  <input value={requestMediaType} onChange={(event) => setRequestMediaType(event.target.value)} />
                </label>
              )}
              {requestMode === 'model' && (
                <label className="entity-field">
                  <span>Model</span>
                  <select value={requestRef ?? ''} onChange={(event) => setRequestModel(event.target.value)}>
                    <option value="" disabled>Choose model</option>
                    {schemaNames.map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </label>
              )}
            </div>
            {requestMode === 'inline' && <p className="api-endpoint-muted">Inline schema. Edit it in Raw.</p>}
            {requestMode === 'none' && <p className="api-endpoint-muted">No request body.</p>}
            {requestMode !== 'none' && Object.values(requestContent).some((media) => object(media).schema) && (
              <button type="button" className="button ghost" onClick={generateRequestExample}>
                <Sparkles size={13} /> Generate example
              </button>
            )}
            {requestExamples.map(({ mediaType, example }) => (
              <div className="api-endpoint-example" key={mediaType}>
                <span>{mediaType}</span>
                <pre>{JSON.stringify(example, null, 2)}</pre>
              </div>
            ))}
          </section>

          <section className="api-endpoint-section">
            <div className="api-endpoint-section-head">
              <h3>Responses</h3>
              <button type="button" className="button ghost" onClick={addResponse}><Plus size={14} /> Add response</button>
            </div>
            {statusError && <p className="api-endpoint-error" role="alert">{statusError}</p>}
            {Object.entries(responses).map(([status, response]) => {
              const body = object(response)
              const content = object(body.content)
              const firstMedia = object(Object.values(content)[0])
              const model = schemaNameFromRef(object(firstMedia.schema).$ref) ?? ''
              const examples = Object.entries(content).flatMap(([mediaType, media]) => {
                const value = object(media)
                return 'example' in value ? [{ mediaType, example: value.example }] : []
              })
              return (
                <div className="api-endpoint-response" key={status}>
                  <div className="api-endpoint-response-row">
                    <input
                      aria-label={`Response ${status} status`}
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
                    <input aria-label={`Response ${status} description`} value={string(body.description)} onChange={(event) => updateResponse(status, { description: event.target.value })} />
                    <select aria-label={`Response ${status} model`} value={model} onChange={(event) => updateResponseModel(status, event.target.value)}>
                      <option value="">None</option>
                      {model && !schemaNames.includes(model) && <option value={model}>{model}</option>}
                      {schemaNames.map((name) => <option key={name} value={name}>{name}</option>)}
                    </select>
                    <button type="button" className="icon-button" aria-label={`Remove response ${status}`} onClick={() => removeResponse(status)}><Trash2 size={13} /></button>
                  </div>
                  <div className="api-endpoint-response-actions">
                    <button type="button" className="button ghost" onClick={() => generateResponseExample(status)} disabled={!Object.values(content).some((media) => object(media).schema)}>
                      <Sparkles size={13} /> Generate example
                    </button>
                    {modelNames(firstMedia).map((name) => <span key={name} className="api-preview-chip response">{name}</span>)}
                  </div>
                  {examples.map(({ mediaType, example }) => (
                    <div className="api-endpoint-example" key={mediaType}>
                      <span>{mediaType}</span>
                      <pre>{JSON.stringify(example, null, 2)}</pre>
                    </div>
                  ))}
                </div>
              )
            })}
          </section>

          <section className="api-endpoint-section">
            <h3>Security</h3>
            <label className="entity-field">
              <span>Requirement</span>
              <select value={securityMode} onChange={(event) => setSecurityMode(event.target.value)}>
                <option value="inherit">Inherit from API</option>
                <option value="public">Public</option>
                <option value="schemes" disabled={!securitySelectable}>Schemes</option>
              </select>
            </label>
            {securityMode === 'schemes' && (
              <div className="api-endpoint-security-list">
                {Object.keys(api?.securitySchemes ?? {}).map((name) => (
                  <label key={name} className="api-endpoint-security-choice">
                    <input type="checkbox" checked={selectedSchemes.includes(name)} onChange={() => toggleSecurity(name)} />
                    {name}
                  </label>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
