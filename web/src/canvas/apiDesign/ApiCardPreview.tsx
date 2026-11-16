import { Braces, Globe2, LockKeyhole, Server } from 'lucide-react'

import type { ApiReferenceEndpoint, ApiReferenceResource, EntityFields } from '@canvas/contract'

import { useApiDesign } from './ApiDesignContext'

function responseClass(status: string): string {
  return `api-response-${status[0] ?? 'x'}`
}

function methodClass(method: string): string {
  return `api-method-${method.toLowerCase()}`
}

function parameterLabel(parameter: { name: string; location: string }): string {
  if (parameter.location === 'path') return `{${parameter.name}}`
  if (parameter.location === 'query') return `?${parameter.name}`
  return `header: ${parameter.name}`
}

function securityLabel(security: string[]): string {
  return security.length > 0 ? security.join(', ') : 'public'
}

function EndpointPreview({ endpoint }: { endpoint: ApiReferenceEndpoint }) {
  return (
    <div className={`api-card-preview api-endpoint-preview${endpoint.deprecated ? ' deprecated' : ''}`}>
      <header className="api-preview-head">
        <span className={`api-method ${methodClass(endpoint.method)}`}>{endpoint.method}</span>
        <code className={endpoint.deprecated ? 'api-preview-path deprecated' : 'api-preview-path'}>{endpoint.path}</code>
        {endpoint.deprecated && <span className="api-reference-deprecated">Deprecated</span>}
      </header>
      {endpoint.summary && <p className="api-preview-summary">{endpoint.summary}</p>}
      {endpoint.parameters.length > 0 && (
        <div className="api-preview-chips">
          {endpoint.parameters.map((parameter) => (
            <span className={`api-preview-chip ${parameter.location}`} key={`${parameter.location}:${parameter.name}`}>
              {parameterLabel(parameter)}
            </span>
          ))}
        </div>
      )}
      {endpoint.requestModels.length > 0 && (
        <div className="api-preview-flow">
          <span>body</span>
          <span aria-hidden="true">→</span>
          <code>{endpoint.requestModels.join(', ')}</code>
        </div>
      )}
      {endpoint.responses.length > 0 && (
        <div className="api-preview-chips">
          {endpoint.responses.map((response) => (
            <span className={`api-preview-chip response ${responseClass(response.status)}`} key={response.status}>
              {response.status}{response.model ? ` → ${response.model}` : ''}
            </span>
          ))}
        </div>
      )}
      <footer className="api-preview-foot">
        {endpoint.security.length > 0
          ? <><LockKeyhole size={12} /> {securityLabel(endpoint.security)}</>
          : <><Globe2 size={12} /> public</>}
      </footer>
    </div>
  )
}

function ResourcePreview({ resource, owner }: { resource: ApiReferenceResource; owner?: string }) {
  return (
    <div className="api-card-preview api-resource-preview">
      <header className="api-preview-head">
        <strong>{resource.name}</strong>
        {resource.inferred && <span className="api-reference-inferred">Inferred</span>}
      </header>
      {resource.description && <p className="api-preview-summary">{resource.description}</p>}
      {owner && <span className="api-preview-muted">{owner}</span>}
    </div>
  )
}

function ApiPreview({
  title,
  version,
  description,
  servers,
  globalSecurity,
  resourceCount,
  endpointCount,
  schemaCount,
}: {
  title: string
  version: string
  description?: string
  servers: string[]
  globalSecurity: string[]
  resourceCount: number
  endpointCount: number
  schemaCount: number
}) {
  return (
    <div className="api-card-preview api-definition-preview">
      <header className="api-preview-head">
        <strong>{title}</strong>
        {version && <span className="api-version-badge">v{version.replace(/^v/i, '')}</span>}
      </header>
      {description && <p className="api-preview-description">{description}</p>}
      {servers.length > 0 && (
        <div className="api-preview-servers">
          <Server size={12} />
          <code>{servers[0]}</code>
          {servers.length > 1 && <span>+{servers.length - 1}</span>}
        </div>
      )}
      <div className="api-preview-counts">
        <span><strong>{resourceCount}</strong> resources</span>
        <span><strong>{endpointCount}</strong> endpoints</span>
        <span><strong>{schemaCount}</strong> schemas</span>
      </div>
      <footer className="api-preview-foot">
        {globalSecurity.length > 0
          ? <><LockKeyhole size={12} /> {globalSecurity.join(', ')}</>
          : <><Globe2 size={12} /> public</>}
      </footer>
    </div>
  )
}

function describeSecurity(type: string, definition: EntityFields): string {
  try {
    const parsed: unknown = JSON.parse(String(definition.definition ?? '{}'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return type
    const scheme = parsed as Record<string, unknown>
    if (type === 'http') return `HTTP ${String(scheme.scheme ?? '')}`.trim()
    if (type === 'apiKey') return `API key in ${String(scheme.in ?? 'header')} ${String(scheme.name ?? '')}`.trim()
    if (type === 'oauth2') return 'OAuth 2'
    if (type === 'openIdConnect') return 'OpenID Connect'
    if (type === 'mutualTLS') return 'Mutual TLS'
    return type
  } catch {
    return type
  }
}

function SecurityPreview({ fields, usedBy }: { fields: EntityFields; usedBy: number }) {
  return (
    <div className="api-card-preview api-security-preview">
      <header className="api-preview-head">
        <strong>{String(fields.name ?? 'Security')}</strong>
      </header>
      <div className="api-security-kind">
        <Braces size={13} />
        <strong>{describeSecurity(String(fields.type ?? 'http'), fields)}</strong>
      </div>
      {fields.description && <p className="api-preview-description">{String(fields.description)}</p>}
      <footer className="api-preview-foot">
        <LockKeyhole size={12} />
        used by <strong>{usedBy}</strong> endpoint{usedBy === 1 ? '' : 's'}
      </footer>
    </div>
  )
}

export function ApiCardPreview({
  entityType,
  nodeId,
  fields,
}: {
  entityType: string
  nodeId: string
  fields: EntityFields
}) {
  const document = useApiDesign()
  if (!document) return <div className="api-card-preview"><span className="api-preview-muted">API data unavailable.</span></div>
  if (entityType === 'endpoint') {
    const endpoint = document.resources.flatMap((resource) => resource.endpoints).find((candidate) => candidate.id === nodeId)
    return endpoint ? <EndpointPreview endpoint={endpoint} /> : <div className="api-card-preview"><span className="api-preview-muted">Endpoint data unavailable.</span></div>
  }
  if (entityType === 'resource') {
    const resource = document.resources.find((candidate) => candidate.id === nodeId)
    return resource ? <ResourcePreview resource={resource} owner={String(fields.owner ?? '')} /> : <div className="api-card-preview"><span className="api-preview-muted">Resource data unavailable.</span></div>
  }
  if (entityType === 'security_scheme') {
    return <SecurityPreview fields={fields} usedBy={document.securityUsage[String(fields.name ?? '')] ?? 0} />
  }
  return <ApiPreview {...document.summary} globalSecurity={document.summary.defaultSecurity} />
}
