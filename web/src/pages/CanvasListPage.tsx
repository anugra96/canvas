import { ArrowRight, Plus, Upload } from 'lucide-react'
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

import type { CanvasClient } from '../api/client'

interface CanvasListPageProps {
  client: CanvasClient
  onOpen: (id: string) => void
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
  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(false)
  const [profileId, setProfileId] = useState('raw')
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
      onOpen(document.id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not import that canvas.')
    } finally {
      setImporting(false)
    }
  }

  async function createCanvas() {
    setBusy(true)
    setError('')
    try {
      const document = await client.createCanvas(undefined, profileId)
      onOpen(document.id)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create a canvas.')
    } finally {
      setBusy(false)
    }
  }

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
            disabled={busy || importing}
          >
            <Upload size={16} />
            {importing ? 'Importing' : 'Import .canvas'}
          </button>
          <select
            className="template-select canvas-profile-select"
            aria-label="Canvas type"
            value={profileId}
            onChange={(event) => setProfileId(event.target.value)}
            disabled={busy || importing}
          >
            {DEFAULT_PROFILES.map((profile) => (
              <option key={profile.id} value={profile.id}>{profile.label}</option>
            ))}
          </select>
          <button className="button primary" onClick={createCanvas} disabled={busy || importing}>
            <Plus size={16} />
            {busy ? 'Creating' : 'New canvas'}
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
          <button className="button primary" onClick={createCanvas} disabled={busy}>
            <Plus size={16} />
            Create the first canvas
          </button>
        </section>
      )}

      {canvases && canvases.length > 0 && (
        <div className="canvas-grid">
          {canvases.map((canvas) => (
            <button className="canvas-card" key={canvas.id} onClick={() => onOpen(canvas.id)}>
              <div className="canvas-card-top">
                <span className="canvas-card-kicker">
                  {findProfile(DEFAULT_PROFILES, canvas.profile ?? 'raw')?.label ?? 'Canvas'}
                </span>
                <ArrowRight size={16} />
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
          ))}
        </div>
      )}
    </main>
  )
}
