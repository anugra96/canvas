import { X } from 'lucide-react'
import { type ReactNode, useEffect } from 'react'
import { createPortal } from 'react-dom'

export function FocusEditor({
  label,
  title,
  badge,
  actions,
  onClose,
  children,
}: {
  label: string
  title: string
  badge?: ReactNode
  actions?: ReactNode
  onClose: () => void
  children: ReactNode
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' || (event.key === 'Enter' && (event.metaKey || event.ctrlKey))) {
        event.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [onClose])

  return createPortal(
    <div
      className="focus-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="focus-panel"
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        <header className="focus-head">
          <div>
            <span className="focus-kicker">{label}</span>
            <div className="focus-title-line">
              {badge}
              <h2>{title}</h2>
            </div>
          </div>
          <div className="focus-actions">
            {actions}
            <button className="button primary" onClick={onClose}>Done</button>
            <button className="icon-button" onClick={onClose} aria-label="Close focus editor">
              <X size={15} />
            </button>
          </div>
        </header>
        <div className="focus-body">
          {children}
        </div>
      </section>
    </div>,
    document.body,
  )
}
