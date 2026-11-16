import { FileJson, X } from 'lucide-react'
import { useRef, useState, type ChangeEvent } from 'react'

import { importOpenApi, type OpenApiImportResult } from '@canvas/contract'

export function OpenApiImportDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean
  onClose: () => void
  onCreate: (result: OpenApiImportResult) => Promise<void>
}) {
  const [source, setSource] = useState('')
  const [preview, setPreview] = useState<OpenApiImportResult | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!open) return null

  function reset() {
    setSource('')
    setPreview(null)
    setError('')
    setBusy(false)
  }

  function close() {
    reset()
    onClose()
  }

  function readSource() {
    setError('')
    try {
      setPreview(importOpenApi(source))
    } catch (cause) {
      setPreview(null)
      setError(cause instanceof Error ? cause.message : 'Could not read the OpenAPI document.')
    }
  }

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    setSource(await file.text())
    setPreview(null)
    setError('')
  }

  async function create() {
    if (!preview) return
    setBusy(true)
    setError('')
    try {
      await onCreate(preview)
      reset()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the API canvas.')
    } finally {
      setBusy(false)
    }
  }

  const endpointCount = preview?.canvas.nodes?.filter((node) => node.app?.entityType === 'endpoint').length ?? 0
  const schemaCount = preview?.canvas.nodes?.filter((node) => node.app?.entityType === 'schema').length ?? 0
  const resourceCount = preview?.canvas.nodes?.filter((node) => node.app?.entityType === 'resource').length ?? 0

  return (
    <div className="modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) close()
    }}>
      <section className="openapi-import-dialog" role="dialog" aria-modal="true" aria-label="Import OpenAPI">
        <header className="openapi-import-head">
          <div>
            <p className="eyebrow">API profile</p>
            <h2>Import OpenAPI</h2>
          </div>
          <button className="icon-button" aria-label="Close OpenAPI import" onClick={close}>
            <X size={16} />
          </button>
        </header>

        <div className="openapi-import-body">
          <div className="openapi-import-source">
            <label className="entity-field">
              <span>OpenAPI 3.1 document</span>
              <textarea
                rows={12}
                value={source}
                onChange={(event) => {
                  setSource(event.target.value)
                  setPreview(null)
                  setError('')
                }}
                placeholder="Paste JSON or YAML, or choose a file."
                spellCheck={false}
              />
            </label>
            <div className="openapi-import-actions">
              <button className="button" onClick={() => fileRef.current?.click()}>
                <FileJson size={16} />
                Choose file
              </button>
              <button className="button primary" onClick={readSource} disabled={!source.trim()}>
                Read document
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".json,.yaml,.yml,application/json,application/yaml,text/yaml"
                onChange={(event) => void readFile(event)}
                hidden
                aria-label="OpenAPI file"
              />
            </div>
          </div>

          <aside className="openapi-import-preview">
            <h3>Preview</h3>
            {preview ? (
              <>
                <strong>{preview.title}</strong>
                <dl>
                  <div><dt>Resources</dt><dd>{resourceCount}</dd></div>
                  <div><dt>Endpoints</dt><dd>{endpointCount}</dd></div>
                  <div><dt>Schemas</dt><dd>{schemaCount}</dd></div>
                </dl>
                {preview.warnings.length > 0 && (
                  <ul className="openapi-import-warnings">
                    {preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                  </ul>
                )}
                <button className="button primary" onClick={() => void create()} disabled={busy}>
                  {busy ? 'Creating canvas' : 'Create API canvas'}
                </button>
              </>
            ) : (
              <p>Read a JSON or YAML document to preview the cards before creating a canvas.</p>
            )}
            {error && <div className="alert" role="alert">{error}</div>}
          </aside>
        </div>
      </section>
    </div>
  )
}
