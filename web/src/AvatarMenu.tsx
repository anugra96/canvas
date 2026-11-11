import { LogOut, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { useAuth } from './auth/AuthContext'
import { mockAuthEnabled } from './auth/auth'

export function AvatarPanel() {
  const { session, signOut } = useAuth()
  return (
    <div className="avatar-panel">
      <strong>{session.displayName}</strong>
      <span>{session.email}</span>
      {mockAuthEnabled() && <span className="local-mode-line">Local mode</span>}
      <button className="button" onClick={signOut}>
        <LogOut size={16} />
        Sign out
      </button>
    </div>
  )
}

export function AvatarMenu() {
  const { session } = useAuth()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLElement>(null)
  const initials = session.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?'

  useEffect(() => {
    if (!open) return
    const first = popupRef.current?.querySelector<HTMLElement>('button')
    first?.focus()
    function close() {
      setOpen(false)
      triggerRef.current?.focus()
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      close()
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (popupRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      close()
    }
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  return (
    <div className="avatar-menu">
      <button
        ref={triggerRef}
        type="button"
        className="avatar-trigger"
        aria-label="Account menu"
        title="Account menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {initials}
      </button>
      {open && (
        <section ref={popupRef} className="avatar-popup" role="dialog" aria-label="Account">
          <header className="avatar-popup-head">
            <h2>Account</h2>
            <button
              type="button"
              className="icon-button"
              aria-label="Close account"
              onClick={() => {
                setOpen(false)
                triggerRef.current?.focus()
              }}
            >
              <X size={15} />
            </button>
          </header>
          <AvatarPanel />
        </section>
      )}
    </div>
  )
}
