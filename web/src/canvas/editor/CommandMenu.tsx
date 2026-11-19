import { ChevronDown, X, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import type { CanvasCommand } from './commands'

function shortcutLabel(command: CanvasCommand): string {
  return command.shortcut?.join(' ') ?? ''
}

export function CommandMenu({
  label,
  icon: Icon,
  commands,
  iconOnly = false,
  triggerLabel,
}: {
  label: string
  icon: LucideIcon
  commands: CanvasCommand[]
  iconOnly?: boolean
  triggerLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const menu = menuRef.current
    const first = menu?.querySelector<HTMLButtonElement>('[role="menuitem"]')
    first?.focus()
    function close() {
      setOpen(false)
      triggerRef.current?.focus()
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      }
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      close()
    }
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  function choose(command: CanvasCommand) {
    setOpen(false)
    command.run()
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  return (
    <div className="command-menu">
      <button
        ref={triggerRef}
        type="button"
        className={`button command-trigger${iconOnly ? ' icon-only' : ''}`}
        aria-label={triggerLabel ?? label}
        title={triggerLabel ?? label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon size={16} />
        {!iconOnly && label}
        {!iconOnly && <ChevronDown size={12} />}
      </button>
      {open && (
        <div
          ref={menuRef}
          className="command-menu-popup"
          role="menu"
          aria-label={`${label} commands`}
        >
          {commands.map((command, index) => {
            const Icon = command.icon
            const previous = commands[index - 1]
            return (
              <div key={command.id}>
                {previous?.section && command.section && previous.section !== command.section && (
                  <div className="command-menu-separator" role="separator" />
                )}
                <button
                  type="button"
                  className="command-menu-item"
                  role="menuitem"
                  aria-label={command.label}
                  title={command.description}
                  disabled={command.disabled}
                  onClick={() => choose(command)}
                >
                  <Icon size={14} />
                  <span>{command.label}</span>
                  {command.description && <small className="command-menu-description">{command.description}</small>}
                  {command.shortcut && <kbd>{shortcutLabel(command)}</kbd>}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function CommandSheet({
  open,
  title,
  commands,
  onClose,
  returnFocusTo,
  children,
}: {
  open: boolean
  title: string
  commands: CanvasCommand[]
  onClose: () => void
  returnFocusTo: React.RefObject<HTMLButtonElement | null>
  children?: ReactNode
}) {
  const sheetRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!open) return
    const first = sheetRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')
    first?.focus()
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
      returnFocusTo.current?.focus()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onClose, open, returnFocusTo])

  if (!open) return null

  function choose(command: CanvasCommand) {
    onClose()
    command.run()
    requestAnimationFrame(() => returnFocusTo.current?.focus())
  }

  return (
    <div className="command-sheet-backdrop" onMouseDown={(event) => {
      if (event.target !== event.currentTarget) return
      onClose()
      returnFocusTo.current?.focus()
    }}>
      <section
        ref={sheetRef}
        className="command-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="command-sheet-head">
          <h2>{title}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close canvas actions"
            onClick={() => {
              onClose()
              returnFocusTo.current?.focus()
            }}
          >
            <X size={16} />
          </button>
        </header>
        <div className="command-sheet-list" role="menu" aria-label={`${title} commands`}>
          {commands.map((command) => {
            const Icon = command.icon
            return (
              <button
                key={command.id}
                type="button"
                className="command-sheet-item"
                role="menuitem"
                aria-label={command.label}
                title={command.description}
                disabled={command.disabled}
                onClick={() => choose(command)}
              >
                <Icon size={16} />
                <span>{command.label}</span>
                {command.description && <small className="command-menu-description">{command.description}</small>}
                {command.shortcut && <kbd>{shortcutLabel(command)}</kbd>}
              </button>
            )
          })}
        </div>
        {children && <div className="command-sheet-extra">{children}</div>}
      </section>
    </div>
  )
}
