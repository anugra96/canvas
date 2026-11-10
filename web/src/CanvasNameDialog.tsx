import { PenLine, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

export function CanvasNameDialog({
  heading,
  initialValue,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  heading: string
  initialValue: string
  confirmLabel: string
  busy?: boolean
  onConfirm: (title: string) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)
  const value = title.trim()

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onCancel])

  return (
    <div
      className="name-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <form
        className="name-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        onSubmit={(event) => {
          event.preventDefault()
          if (value) onConfirm(value)
        }}
      >
        <header className="name-dialog-head">
          <div>
            <span className="name-dialog-kicker"><PenLine size={13} /> Canvas</span>
            <h2>{heading}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onCancel} aria-label="Close name dialog">
            <X size={16} />
          </button>
        </header>

        <label className="name-dialog-field">
          Canvas name
          <input
            ref={inputRef}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={160}
            placeholder="Untitled canvas"
            required
          />
        </label>

        <div className="name-dialog-actions">
          <button type="button" className="button" onClick={onCancel}>Cancel</button>
          <button type="submit" className="button primary" disabled={!value || busy}>
            {busy ? 'Saving' : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
