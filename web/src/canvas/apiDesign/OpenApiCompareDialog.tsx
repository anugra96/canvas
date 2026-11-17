import { FileJson, X } from 'lucide-react'
import { useEffect, useState, type ChangeEvent } from 'react'

import {
  diffOpenApi,
  exportOpenApiDocument,
  parseOpenApiSource,
  toMarkdownChangelog,
  type CanvasSummary,
  type JsonObject,
  type OpenApiDiffResult,
} from '@canvas/contract'

import type { CanvasClient } from '../../api/client'

export function OpenApiCompareDialog({
  client,
  currentCanvasId,
  head,
  onClose,
}: {
  client: CanvasClient
  currentCanvasId: string
  head: JsonObject
  onClose: () => void
}) {
  const [mode, setMode] = useState<'file' | 'canvas'>('file')
  const [source, setSource] = useState('')
  const [canvases, setCanvases] = useState<CanvasSummary[]>([])
  const [canvasId, setCanvasId] = useState('')
  const [result, setResult] = useState<OpenApiDiffResult | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    void client.listCanvases()
      .then((items) => {
        if (!active) return
        const options = items.filter((item) => item.profile === 'api' && item.id !== currentCanvasId)
        setCanvases(options)
        setCanvasId((current) => current || options[0]?.id || '')
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not list API canvases.')
      })
    return () => { active = false }
  }, [client, currentCanvasId])

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    setSource(await file.text())
    setResult(null)
    setError('')
  }

  async function compare() {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      let base: JsonObject
      if (mode === 'canvas') {
        if (!canvasId) throw new Error('Choose an API canvas.')
        const document = await client.getCanvas(canvasId)
        base = exportOpenApiDocument(document.canvas)
      } else {
        base = parseOpenApiSource(source).document
      }
      setResult(diffOpenApi(base, head))
    } catch (cause) {
      setResult(null)
      setError(cause instanceof Error ? cause.message : 'Could not compare the documents.')
    } finally {
      setBusy(false)
    }
  }

  function copyChangelog() {
    if (!result) return
    void navigator.clipboard.writeText(toMarkdownChangelog(result))
      .then(() => setNotice('Copied changelog.'))
      .catch(() => setError('Clipboard access was denied.'))
  }

  const breaking = result
    ? Object.entries(result.endpoints).filter(([, changes]) => changes.breaking.length > 0).sort(([left], [right]) => left.localeCompare(right))
    : []
  const compatible = result
    ? Object.entries(result.endpoints).filter(([, changes]) => changes.compatible.length > 0).sort(([left], [right]) => left.localeCompare(right))
    : []

  return (
    <div className="modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="compare-dialog" role="dialog" aria-modal="true" aria-label="Compare OpenAPI">
        <header className="openapi-import-head">
          <div>
            <p className="eyebrow">API profile</p>
            <h2>Compare OpenAPI</h2>
          </div>
          <button className="icon-button" aria-label="Close compare dialog" onClick={onClose}><X size={16} /></button>
        </header>

        <div className="compare-body">
          <div className="compare-controls">
            <div className="compare-tabs" role="tablist" aria-label="Base source">
              <button type="button" role="tab" aria-selected={mode === 'file'} className={mode === 'file' ? 'active' : ''} onClick={() => setMode('file')}>File</button>
              <button type="button" role="tab" aria-selected={mode === 'canvas'} className={mode === 'canvas' ? 'active' : ''} onClick={() => setMode('canvas')}>API canvas</button>
            </div>
            {mode === 'file' ? (
              <>
                <label className="entity-field">
                  <span>Base OpenAPI document</span>
                  <textarea
                    rows={10}
                    value={source}
                    onChange={(event) => {
                      setSource(event.target.value)
                      setResult(null)
                      setError('')
                    }}
                    placeholder="Paste JSON or YAML, or choose a file."
                    spellCheck={false}
                  />
                </label>
                <label className="button" role="button">
                  <FileJson size={15} /> Choose file
                  <input type="file" accept=".json,.yaml,.yml" hidden onChange={(event) => void readFile(event)} />
                </label>
              </>
            ) : (
              <label className="entity-field">
                <span>Base API canvas</span>
                <select value={canvasId} onChange={(event) => {
                  setCanvasId(event.target.value)
                  setResult(null)
                }}>
                  {canvases.length === 0 && <option value="">No other API canvases</option>}
                  {canvases.map((canvas) => <option key={canvas.id} value={canvas.id}>{canvas.title}</option>)}
                </select>
              </label>
            )}
            <button type="button" className="button primary" onClick={() => void compare()} disabled={busy || (mode === 'file' ? !source.trim() : !canvasId)}>
              {busy ? 'Comparing' : 'Compare'}
            </button>
            {result && <button type="button" className="button" onClick={copyChangelog}>Copy changelog</button>}
            {error && <div className="alert" role="alert">{error}</div>}
            {notice && <p className="api-endpoint-muted" role="status">{notice}</p>}
          </div>

          <div className="compare-results">
            {!result ? (
              <p className="api-endpoint-muted">Choose a base document and compare it with this canvas.</p>
            ) : (
              <>
                <section className="compare-group">
                  <h3>Breaking <span>{breaking.reduce((sum, [, changes]) => sum + changes.breaking.length, 0)}</span></h3>
                  {breaking.length === 0 ? <p className="api-endpoint-muted">No breaking changes.</p> : breaking.map(([key, changes]) => (
                    <div className="compare-endpoint" key={key}>
                      <strong>{key}</strong>
                      <ul>{changes.breaking.map((change) => <li key={change.kind + change.message}>{change.message}{change.warning ? ' (warning)' : ''}</li>)}</ul>
                    </div>
                  ))}
                </section>
                <section className="compare-group">
                  <h3>Compatible <span>{compatible.reduce((sum, [, changes]) => sum + changes.compatible.length, 0)}</span></h3>
                  {compatible.length === 0 ? <p className="api-endpoint-muted">No compatible changes.</p> : compatible.map(([key, changes]) => (
                    <div className="compare-endpoint" key={key}>
                      <strong>{key}</strong>
                      <ul>{changes.compatible.map((change) => <li key={change.kind + change.message}>{change.message}{change.warning ? ' (warning)' : ''}</li>)}</ul>
                    </div>
                  ))}
                </section>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
