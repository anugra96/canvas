import { FileCode2, X } from 'lucide-react'
import { useRef, useState, type ChangeEvent } from 'react'

import type { DatabaseImportResult } from '@canvas/contract/database-import'

export function DatabaseImportDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean
  onClose: () => void
  onCreate: (result: DatabaseImportResult) => Promise<void>
}) {
  const [source, setSource] = useState('')
  const [title, setTitle] = useState('Imported database')
  const [preview, setPreview] = useState<DatabaseImportResult | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [parsing, setParsing] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!open) return null

  function reset() {
    setSource('')
    setTitle('Imported database')
    setPreview(null)
    setError('')
    setBusy(false)
    setParsing(false)
  }

  function close() {
    reset()
    onClose()
  }

  async function readSource() {
    setError('')
    setParsing(true)
    try {
      const { importDatabaseFromSql } = await import('./loadDatabaseParser')
      const result = await importDatabaseFromSql(source)
      setPreview({ ...result, title })
    } catch (cause) {
      setPreview(null)
      setError(cause instanceof Error ? cause.message : 'Could not read the PostgreSQL DDL.')
    } finally {
      setParsing(false)
    }
  }

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    setSource(await file.text())
    setTitle(file.name.replace(/\.sql$/i, '').trim() || 'Imported database')
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
      setError(cause instanceof Error ? cause.message : 'Could not create the database canvas.')
    } finally {
      setBusy(false)
    }
  }

  const count = (type: string) => preview?.canvas.nodes?.filter((node) => node.app?.entityType === type).length ?? 0
  const extraCount = (String(preview?.canvas.nodes?.find((node) => node.app?.entityType === 'database_definition')?.app?.fields?.extra ?? '')
    .trim()
    ? preview?.warnings.find((warning) => warning.includes('Extra DDL')) ?? ''
    : '')

  return (
    <div className="modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) close()
    }}>
      <section className="openapi-import-dialog" role="dialog" aria-modal="true" aria-label="Import DDL">
        <header className="openapi-import-head">
          <div>
            <p className="eyebrow">Database profile</p>
            <h2>Import PostgreSQL DDL</h2>
          </div>
          <button className="icon-button" aria-label="Close DDL import" onClick={close}>
            <X size={16} />
          </button>
        </header>

        <div className="openapi-import-body">
          <div className="openapi-import-source">
            <label className="entity-field">
              <span>PostgreSQL DDL</span>
              <textarea
                rows={12}
                value={source}
                onChange={(event) => {
                  setSource(event.target.value)
                  setPreview(null)
                  setError('')
                }}
                placeholder="Paste pg_dump --schema-only output, or choose a .sql file."
                spellCheck={false}
              />
            </label>
            <div className="openapi-import-actions">
              <button className="button" onClick={() => fileRef.current?.click()}>
                <FileCode2 size={16} />
                Choose .sql file
              </button>
              <button className="button primary" onClick={() => void readSource()} disabled={!source.trim() || parsing}>
                {parsing ? 'Parsing DDL' : 'Read DDL'}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".sql,text/plain,application/sql"
                onChange={(event) => void readFile(event)}
                hidden
                aria-label="PostgreSQL DDL file"
              />
            </div>
          </div>

          <aside className="openapi-import-preview">
            <h3>Preview</h3>
            {preview ? (
              <>
                <strong>{preview.title}</strong>
                <dl>
                  <div><dt>Schemas</dt><dd>{count('db_schema')}</dd></div>
                  <div><dt>Tables</dt><dd>{count('table')}</dd></div>
                  <div><dt>Enums</dt><dd>{count('db_enum')}</dd></div>
                </dl>
                {extraCount && <p className="database-import-extra">{extraCount}</p>}
                {preview.warnings.length > 0 && (
                  <ul className="openapi-import-warnings">
                    {preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                  </ul>
                )}
                <button className="button primary" onClick={() => void create()} disabled={busy}>
                  {busy ? 'Creating canvas' : 'Create database canvas'}
                </button>
              </>
            ) : (
              <p>Read PostgreSQL DDL to preview the cards before creating a canvas.</p>
            )}
            {error && <div className="alert" role="alert">{error}</div>}
          </aside>
        </div>
      </section>
    </div>
  )
}
