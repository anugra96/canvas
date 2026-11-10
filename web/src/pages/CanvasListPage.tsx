import { PenLine, Plus, Search, Trash2, Upload } from 'lucide-react'
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'

import {
  DEFAULT_PROFILES,
  MAX_CANVAS_BYTES,
  findProfile,
  normalizeImportedCanvas,
  validateCanvas,
  type CanvasSummary,
} from '@canvas/contract'

import { CanvasConflictError, type CanvasClient } from '../api/client'
import { CanvasNameDialog } from '../CanvasNameDialog'
import { DeleteCanvasDialog } from '../DeleteCanvasDialog'

interface CanvasListPageProps {
  client: CanvasClient
  onOpen: (id: string, title: string) => void
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

export function CanvasListPage({ client, onOpen }: CanvasListPageProps) {
  const [canvases, setCanvases] = useState<CanvasSummary[] | null>(null)
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const [profileId, setProfileId] = useState('raw')
  const [nameDialog, setNameDialog] = useState<
    { mode: 'create' } | { mode: 'rename'; canvas: CanvasSummary } | null
  >(null)
  const [nameBusy, setNameBusy] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<CanvasSummary | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [query, setQuery] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    client.listCanvases()
      .then((next) => {
        if (active) setCanvases(next)
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not load canvases.')
      })
    return () => {
      active = false
    }
  }, [client])

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    input.value = ''
    if (!file) return

    setImporting(true)
    setError('')
    try {
      if (file.size > MAX_CANVAS_BYTES) {
        throw new Error(`Canvas files must be smaller than ${MAX_CANVAS_BYTES} bytes.`)
      }
      const raw = await file.text()
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        throw new Error('That file is not valid JSON.')
      }
      const validation = validateCanvas(normalizeImportedCanvas(parsed))
      if (!validation.ok) {
        throw new Error(validation.errors.join(' '))
      }
      const title = file.name.replace(/\.canvas$/i, '').trim() || 'Imported canvas'
      const document = await client.importCanvas(title, validation.canvas)
      onOpen(document.id, document.title)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not import that canvas.')
    } finally {
      setImporting(false)
    }
  }

  async function submitCanvasName(title: string) {
    if (!nameDialog) return
    setNameBusy(true)
    setError('')
    try {
      if (nameDialog.mode === 'create') {
        const document = await client.createCanvas(title, profileId)
        setNameDialog(null)
        onOpen(document.id, document.title)
        return
      }
      const renamed = await client.renameCanvas(nameDialog.canvas.id, title, nameDialog.canvas.etag)
      setCanvases((current) => current?.map((canvas) => (
        canvas.id === renamed.id ? {
          ...canvas,
          title: renamed.title,
          etag: renamed.etag,
          updatedAt: renamed.updatedAt,
          updatedBy: renamed.updatedBy,
        } : canvas
      )) ?? current)
      setNameDialog(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the canvas name.')
    } finally {
      setNameBusy(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleteBusy(true)
    setError('')
    try {
      await client.deleteCanvas(deleteTarget.id, deleteTarget.etag)
      setCanvases((current) => current?.filter((canvas) => canvas.id !== deleteTarget.id) ?? current)
    } catch (cause) {
      setError(cause instanceof CanvasConflictError
        ? `"${deleteTarget.title}" changed since this list loaded. Reload and try again.`
        : cause instanceof Error ? cause.message : 'Could not delete the canvas.')
    } finally {
      setDeleteBusy(false)
      setDeleteTarget(null)
    }
  }

  const search = query.trim().toLowerCase()
  const visibleCanvases = search
    ? canvases?.filter((canvas) => canvas.title.toLowerCase().includes(search)) ?? null
    : canvases

  return (
    <main className="content">
      <div className="page-head">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>Canvases</h1>
          <p className="page-subtitle">Obsidian-compatible boards for shared operational work.</p>
        </div>
        <div className="page-actions">
          <button
            className="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={nameBusy || importing}
          >
            <Upload size={16} />
            {importing ? 'Importing' : 'Import .canvas'}
          </button>
          <select
            className="template-select canvas-profile-select"
            aria-label="Canvas type"
            value={profileId}
            onChange={(event) => setProfileId(event.target.value)}
            disabled={nameBusy || importing}
          >
            {DEFAULT_PROFILES.map((profile) => (
              <option key={profile.id} value={profile.id}>{profile.label}</option>
            ))}
          </select>
          <button className="button primary" onClick={() => setNameDialog({ mode: 'create' })} disabled={nameBusy || importing}>
            <Plus size={16} />
            New canvas
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".canvas,application/json"
            onChange={importFile}
            hidden
            aria-label="Import .canvas file"
          />
        </div>
      </div>

      {error && <div className="alert" role="alert">{error}</div>}

      {canvases === null && !error && (
        <div className="canvas-grid" aria-label="Loading canvases">
          {[0, 1, 2].map((item) => <div className="canvas-card skeleton" key={item} />)}
        </div>
      )}

      {canvases?.length === 0 && (
        <section className="empty-state">
          <div className="empty-icon"><span className="brand-mark">SC</span></div>
          <h2>No canvases yet</h2>
          <p>Create a fresh board. Your edits stay local until you connect S3 later.</p>
          <button className="button primary" onClick={() => setNameDialog({ mode: 'create' })} disabled={nameBusy}>
            <Plus size={16} />
            Create the first canvas
          </button>
        </section>
      )}

      {canvases && canvases.length > 0 && (
        <label className="canvas-search">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search canvases"
            aria-label="Search canvases"
          />
        </label>
      )}

      {canvases && canvases.length > 0 && visibleCanvases?.length === 0 && (
        <p className="canvas-search-empty">No canvas title matches "{query.trim()}".</p>
      )}

      {visibleCanvases && visibleCanvases.length > 0 && (
        <div className="canvas-grid">
          {visibleCanvases.map((canvas) => (
            <div className="canvas-card" key={canvas.id}>
              <button
                className="canvas-card-open"
                onClick={() => onOpen(canvas.id, canvas.title)}
                aria-label={`Open ${canvas.title}`}
              >
                <div className="canvas-card-top">
                  <span className="canvas-card-kicker">
                    {findProfile(DEFAULT_PROFILES, canvas.profile ?? 'raw')?.label ?? 'Canvas'}
                  </span>
                </div>
                <h2>{canvas.title}</h2>
                <div className="canvas-card-meta">
                  <span>{canvas.nodeCount} nodes</span>
                  <span>{canvas.edgeCount} edges</span>
                </div>
                <p className="canvas-card-updated">
                  {formatDate(canvas.updatedAt)} by {canvas.updatedBy}
                </p>
              </button>
              <div className="canvas-card-actions">
                <button
                  className="canvas-card-action"
                  onClick={() => setNameDialog({ mode: 'rename', canvas })}
                  aria-label={`Edit title for ${canvas.title}`}
                  title="Edit canvas title"
                >
                  <PenLine size={15} />
                </button>
                <button
                  className="canvas-card-action danger"
                  onClick={() => setDeleteTarget(canvas)}
                  aria-label={`Delete ${canvas.title}`}
                  title="Delete canvas"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {nameDialog && (
        <CanvasNameDialog
          heading={nameDialog.mode === 'create' ? 'Name your canvas' : 'Rename canvas'}
          initialValue={nameDialog.mode === 'create' ? 'Untitled canvas' : nameDialog.canvas.title}
          confirmLabel={nameDialog.mode === 'create' ? 'Create canvas' : 'Save name'}
          busy={nameBusy}
          onConfirm={(title) => void submitCanvasName(title)}
          onCancel={() => setNameDialog(null)}
        />
      )}

      {deleteTarget && (
        <DeleteCanvasDialog
          title={deleteTarget.title}
          busy={deleteBusy}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </main>
  )
}
