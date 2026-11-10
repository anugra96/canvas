import { Camera, Crop, Download, Maximize2, X } from 'lucide-react'
import { useEffect } from 'react'

const SCALES = [
  { value: 2, label: '2x' },
  { value: 3, label: '3x' },
  { value: 4, label: '4x' },
]

export function ScreenshotDialog({
  open,
  busy,
  scale,
  error,
  onScaleChange,
  onFull,
  onSelect,
  onClose,
}: {
  open: boolean
  busy: boolean
  scale: number
  error: string
  onScaleChange: (scale: number) => void
  onFull: () => void
  onSelect: () => void
  onClose: () => void
}) {
  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [open, busy, onClose])

  if (!open) return null

  return (
    <div
      className="screenshot-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <section
        className="screenshot-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="screenshot-title"
      >
        <header className="screenshot-head">
          <div>
            <span className="screenshot-kicker"><Camera size={13} /> Export image</span>
            <h2 id="screenshot-title">Screenshot canvas</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close screenshot dialog" disabled={busy}>
            <X size={16} />
          </button>
        </header>

        <p className="screenshot-copy">
          Export a PNG of the full canvas or draw a box around the part you need.
        </p>

        <label className="screenshot-scale">
          <span>Resolution</span>
          <select
            className="template-select"
            value={scale}
            onChange={(event) => onScaleChange(Number(event.target.value))}
            disabled={busy}
          >
            {SCALES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        {error && <div className="alert screenshot-error" role="alert">{error}</div>}

        <div className="screenshot-actions">
          <button className="button primary" onClick={onFull} disabled={busy}>
            <Maximize2 size={16} />
            {busy ? 'Rendering' : 'Full canvas'}
          </button>
          <button className="button" onClick={onSelect} disabled={busy}>
            <Crop size={16} />
            Select area
          </button>
        </div>

        <p className="screenshot-foot">
          <Download size={12} /> PNG with the current canvas background
        </p>
      </section>
    </div>
  )
}
