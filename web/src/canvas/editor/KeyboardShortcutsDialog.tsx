import { X } from 'lucide-react'

import type { CanvasCommand } from './commands'
import { SHORTCUT_GROUPS } from './shortcuts'

export function KeyboardShortcutsDialog({
  open,
  onClose,
  commands,
}: {
  open: boolean
  onClose: () => void
  commands: CanvasCommand[]
}) {
  if (!open) return null
  const commandItems = commands
    .filter((command) => command.shortcut?.length)
    .map((command) => ({ keys: command.shortcut!, label: command.label }))
  const groups = commandItems.length > 0
    ? [{ title: 'Commands', items: commandItems }, ...SHORTCUT_GROUPS]
    : SHORTCUT_GROUPS

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
          {groups.map((group) => (
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
