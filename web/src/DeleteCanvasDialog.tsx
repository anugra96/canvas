import { Trash2, X } from 'lucide-react'
import { useEffect, useRef } from 'react'

export function DeleteCanvasDialog({
  title,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    // Focus the safe action first.
    cancelRef.current?.focus()
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
        role="alertdialog"
        aria-modal="true"
        aria-label="Delete canvas"
        onSubmit={(event) => {
          event.preventDefault()
          onConfirm()
        }}
      >
        <header className="name-dialog-head">
          <div>
            <span className="name-dialog-kicker"><Trash2 size={13} /> Canvas</span>
            <h2>Delete "{title}"?</h2>
          </div>
          <button type="button" className="icon-button" onClick={onCancel} aria-label="Close delete dialog">
            <X size={16} />
          </button>
        </header>

        <p className="delete-dialog-body">
          The canvas leaves this list. Links to it from other canvases stop working.
          An administrator can restore it from storage.
        </p>

        <div className="name-dialog-actions">
          <button ref={cancelRef} type="button" className="button" onClick={onCancel}>Cancel</button>
          <button type="submit" className="button danger" disabled={busy}>
            {busy ? 'Deleting' : 'Delete canvas'}
          </button>
        </div>
      </form>
    </div>
  )
}
