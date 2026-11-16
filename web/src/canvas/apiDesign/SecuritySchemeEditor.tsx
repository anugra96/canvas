import { buildSecuritySchemeDefinition, type EntityFields } from '@canvas/contract'

function value(fields: EntityFields, key: string): string {
  return fields[key] == null ? '' : String(fields[key])
}

const TYPE_LABELS: Record<string, string> = {
  http: 'HTTP',
  apiKey: 'API key',
  oauth2: 'OAuth 2',
  openIdConnect: 'OpenID Connect',
  mutualTLS: 'Mutual TLS',
}

export function SecuritySchemeEditor({
  fields,
  onChange,
}: {
  fields: EntityFields
  onChange: (key: string, value: string) => void
}) {
  const type = value(fields, 'type') || 'http'
  const definition = buildSecuritySchemeDefinition(fields)

  function update(key: string, next: string) {
    const nextFields = { ...fields, [key]: next }
    onChange(key, next)
    if (key !== 'definition') {
      onChange('definition', JSON.stringify(buildSecuritySchemeDefinition(nextFields), null, 2))
    }
  }

  return (
    <div className="api-form">
      <section className="api-form-section">
        <div className="api-form-grid">
          <label className="entity-field">
            <span>Name</span>
            <input value={value(fields, 'name')} onChange={(event) => update('name', event.target.value)} />
          </label>
          <label className="entity-field">
            <span>Type</span>
            <select value={type} onChange={(event) => update('type', event.target.value)}>
              {Object.entries(TYPE_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
        </div>
        <label className="entity-field">
          <span>Description</span>
          <textarea rows={3} value={value(fields, 'description')} onChange={(event) => update('description', event.target.value)} />
        </label>
      </section>

      {type === 'http' && (
        <section className="api-form-section">
          <h3>HTTP</h3>
          <div className="api-form-grid">
            <label className="entity-field">
              <span>Scheme</span>
              <select value={value(fields, 'scheme') || 'bearer'} onChange={(event) => update('scheme', event.target.value)}>
                <option value="bearer">Bearer</option>
                <option value="basic">Basic</option>
              </select>
            </label>
            <label className="entity-field">
              <span>Bearer format</span>
              <input value={value(fields, 'bearerFormat')} onChange={(event) => update('bearerFormat', event.target.value)} placeholder="JWT" />
            </label>
          </div>
        </section>
      )}

      {type === 'apiKey' && (
        <section className="api-form-section">
          <h3>API key</h3>
          <div className="api-form-grid">
            <label className="entity-field">
              <span>In</span>
              <select value={value(fields, 'in') || 'header'} onChange={(event) => update('in', event.target.value)}>
                <option value="header">Header</option>
                <option value="query">Query</option>
                <option value="cookie">Cookie</option>
              </select>
            </label>
            <label className="entity-field">
              <span>Parameter name</span>
              <input value={value(fields, 'parameterName')} onChange={(event) => update('parameterName', event.target.value)} />
            </label>
          </div>
        </section>
      )}

      {type === 'openIdConnect' && (
        <section className="api-form-section">
          <h3>OpenID Connect</h3>
          <label className="entity-field">
            <span>Discovery URL</span>
            <input type="url" value={value(fields, 'discoveryUrl')} onChange={(event) => update('discoveryUrl', event.target.value)} />
          </label>
        </section>
      )}

      {type === 'oauth2' && (
        <section className="api-form-section">
          <h3>OAuth 2</h3>
          <p className="api-endpoint-muted">Flows are JSON, edited under Advanced.</p>
        </section>
      )}

      <details className="api-form-advanced">
        <summary>Advanced</summary>
        {type === 'oauth2' && (
          <label className="entity-field">
            <span>Flows</span>
            <textarea rows={8} value={value(fields, 'flows')} onChange={(event) => update('flows', event.target.value)} spellCheck={false} />
          </label>
        )}
        <label className="entity-field">
          <span>Definition</span>
          <textarea rows={8} value={JSON.stringify(definition, null, 2)} readOnly spellCheck={false} />
        </label>
      </details>
    </div>
  )
}
