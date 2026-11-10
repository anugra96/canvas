import { ExternalLink, Link2, Plus, Search, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'

import type { CanvasLink, CanvasSummary } from '@canvas/contract'

import { CanvasNameDialog } from '../../CanvasNameDialog'

export function CanvasLinksDialog({
  nodeName,
  links,
  currentCanvasId,
  trailIds,
  canvases,
  loading,
  error,
  onClose,
  onOpen,
  onLinkExisting,
  onUnlink,
  onLabel,
  onCreateNew,
}: {
  nodeName: string
  links: CanvasLink[]
  currentCanvasId: string
  trailIds: string[]
  canvases: CanvasSummary[]
  loading: boolean
  error: string
  onClose: () => void
  onOpen: (link: CanvasLink) => Promise<void>
  onLinkExisting: (canvasId: string) => void
  onUnlink: (linkId: string) => void
  onLabel: (linkId: string, label: string) => void
  onCreateNew: (title: string) => Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [actionError, setActionError] = useState('')

  const candidates = useMemo(() => {
    const linkedIds = new Set(links.map((link) => link.canvasId))
    const term = query.trim().toLowerCase()
    return canvases
      .filter((canvas) => canvas.id !== currentCanvasId && !linkedIds.has(canvas.id))
      .filter((canvas) => !term || canvas.title.toLowerCase().includes(term))
      .slice(0, 30)
  }, [canvases, currentCanvasId, links, query])
  const byId = new Map(canvases.map((canvas) => [canvas.id, canvas]))

  async function open(link: CanvasLink) {
    try {
      setActionError('')
      await onOpen(link)
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Could not open the linked canvas.')
    }
  }

  async function create(title: string) {
    setCreating(true)
    try {
      setActionError('')
      await onCreateNew(title)
      setCreateOpen(false)
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Could not create the linked canvas.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="link-dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section className="link-dialog" role="dialog" aria-modal="true" aria-label="Linked canvases">
        <header className="link-dialog-head">
          <div>
            <span className="link-dialog-kicker"><Link2 size={13} /> Canvas links</span>
            <h2>{nodeName}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close linked canvases">
            <X size={16} />
          </button>
        </header>

        {(error || actionError) && <div className="alert" role="alert">{error || actionError}</div>}

        <div className="link-dialog-section">
          <div className="link-dialog-section-head">
            <h3>Linked canvases</h3>
            <span>{links.length}</span>
          </div>
          {links.length === 0 ? (
            <p className="link-dialog-empty">No canvases linked to this card.</p>
          ) : (
            <div className="link-list">
              {links.map((link) => {
                const canvas = byId.get(link.canvasId)
                const cyclic = trailIds.includes(link.canvasId)
                return (
                  <div className="link-row" key={link.id}>
                    <input
                      className="link-label-input"
                      value={link.label ?? ''}
                      aria-label={`Link label for ${canvas?.title ?? 'canvas'}`}
                      placeholder="Documentation"
                      onChange={(event) => onLabel(link.id, event.target.value)}
                    />
                    <span className="link-target">
                      {canvas ? canvas.title : 'Missing canvas'}
                      {cyclic && <small>Already open in trail</small>}
                    </span>
                    <button
                      className="icon-button"
                      onClick={() => void open(link)}
                      disabled={cyclic || !canvas}
                      aria-label={`Open ${canvas?.title ?? 'linked canvas'}`}
                    >
                      <ExternalLink size={14} />
                    </button>
                    <button
                      className="icon-button"
                      onClick={() => onUnlink(link.id)}
                      aria-label={`Unlink ${canvas?.title ?? 'linked canvas'}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="link-dialog-section">
          <div className="link-dialog-section-head">
            <h3>Link an existing canvas</h3>
            <label className="link-search">
              <Search size={13} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search canvases"
                aria-label="Search canvases"
              />
            </label>
          </div>
          <div className="link-candidates">
            {loading ? (
              <p className="link-dialog-empty">Loading canvases...</p>
            ) : candidates.length === 0 ? (
              <p className="link-dialog-empty">No available canvases.</p>
            ) : candidates.map((canvas) => (
              <div className="link-candidate" key={canvas.id}>
                <span>
                  <strong>{canvas.title}</strong>
                  <small>{canvas.profile === 'systems' ? 'Systems' : 'Raw'} · {canvas.nodeCount} nodes</small>
                </span>
                <button className="button" onClick={() => onLinkExisting(canvas.id)}>
                  Link
                </button>
              </div>
            ))}
          </div>
        </div>

        <footer className="link-dialog-actions">
          <button className="button" onClick={onClose}>Done</button>
          <button className="button primary" onClick={() => setCreateOpen(true)}>
            <Plus size={15} />
            Create new canvas
          </button>
        </footer>
      </section>

      {createOpen && (
        <CanvasNameDialog
          heading="Create linked canvas"
          initialValue="Linked canvas"
          confirmLabel="Create and link"
          busy={creating}
          onConfirm={(title) => void create(title)}
          onCancel={() => setCreateOpen(false)}
        />
      )}
    </div>
  )
}
