import { X } from 'lucide-react'

import { SHORTCUT_GROUPS } from './shortcuts'

export function KeyboardShortcutsDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  if (!open) return null

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="shortcut-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
      >
        <header className="shortcut-head">
          <div>
            <p className="eyebrow">Canvas help</p>
            <h2>Keyboard shortcuts</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close keyboard shortcuts">
            <X size={16} />
          </button>
        </header>

        <div className="shortcut-groups">
          {SHORTCUT_GROUPS.map((group) => (
            <section className="shortcut-group" key={group.title}>
              <h3>{group.title}</h3>
              <div className="shortcut-list">
                {group.items.map((item) => (
                  <div className="shortcut-row" key={`${group.title}-${item.label}`}>
                    <span>{item.label}</span>
                    <span className="shortcut-keys">
                      {item.keys.map((key) => (
                        <kbd key={key}>{key}</kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </div>
  )
}
