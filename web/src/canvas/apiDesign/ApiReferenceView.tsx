import { useMemo } from 'react'

import { buildApiReference, type CanvasNode } from '@canvas/contract'

import type { CanvasFlowNode } from '../model/adapter'

export function ApiReferenceView({ nodes }: { nodes: CanvasFlowNode[] }) {
  const resources = useMemo(
    () => buildApiReference(nodes.map((node) => node.data.raw as CanvasNode)),
    [nodes],
  )

  if (resources.length === 0) {
    return (
      <div className="derived-empty">
        <strong>No resources to document.</strong>
        <span>Add a Resource card and endpoints on the source canvas.</span>
      </div>
    )
  }

  return (
    <div className="api-reference derived-scroll">
      {resources.map((resource) => (
        <section className="api-reference-resource" key={resource.id}>
          <header>
            <div>
              <h3>{resource.name}</h3>
              {resource.description && <p>{resource.description}</p>}
            </div>
            {resource.inferred && <span className="api-reference-inferred">Inferred</span>}
          </header>
          {resource.endpoints.map((endpoint) => (
            <article className="api-reference-endpoint" key={endpoint.id}>
              <div className="api-reference-endpoint-head">
                <span className={`api-method api-method-${endpoint.method.toLowerCase()}`}>{endpoint.method}</span>
                <code>{endpoint.path}</code>
                {endpoint.deprecated && <span className="api-reference-deprecated">Deprecated</span>}
              </div>
              {endpoint.summary && <strong>{endpoint.summary}</strong>}
              {endpoint.description && <p>{endpoint.description}</p>}
              {endpoint.parameters.length > 0 && (
                <div className="api-reference-block">
                  <span>Parameters</span>
                  <table className="api-reference-table">
                    <thead>
                      <tr><th>Name</th><th>In</th><th>Type</th><th>Required</th></tr>
                    </thead>
                    <tbody>
                      {endpoint.parameters.map((parameter) => (
                        <tr key={`${parameter.location}:${parameter.name}`}>
                          <td>{parameter.name}</td>
                          <td>{parameter.location}</td>
                          <td>{parameter.type ?? '—'}</td>
                          <td>{parameter.required ? 'Yes' : 'No'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {endpoint.requestModels.length > 0 && (
                <div className="api-reference-block">
                  <span>Request</span>
                  <div className="api-reference-models">
                    {endpoint.requestModels.map((model) => <code key={model}>{model}</code>)}
                  </div>
                </div>
              )}
              {endpoint.responses.length > 0 && (
                <div className="api-reference-block">
                  <span>Responses</span>
                  <div className="api-reference-responses">
                    {endpoint.responses.map((response) => (
                      <div key={response.status}>
                        <code className={`api-status api-status-${response.status[0]}`}>{response.status}</code>
                        <span>{response.description}</span>
                        {response.model && <code>{response.model}</code>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {endpoint.security.length > 0 && (
                <div className="api-reference-security">
                  <span>Security</span>
                  {endpoint.security.map((scheme) => <code key={scheme}>{scheme}</code>)}
                </div>
              )}
            </article>
          ))}
        </section>
      ))}
    </div>
  )
}
