import { Palette, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { AppearanceControls } from './AppearanceControls'

export function AppearanceMenu() {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!open) return
    const first = popupRef.current?.querySelector<HTMLElement>('select, input, button')
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
    <div className="appearance-menu">
      <button
        ref={triggerRef}
        type="button"
        className="icon-button"
        aria-label="Appearance"
        title="Appearance"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Palette size={16} />
      </button>
      {open && (
        <section ref={popupRef} className="appearance-popup" role="dialog" aria-label="Appearance">
          <header className="appearance-popup-head">
            <h2>Appearance</h2>
            <button
              type="button"
              className="icon-button"
              aria-label="Close appearance"
              onClick={() => {
                setOpen(false)
                triggerRef.current?.focus()
              }}
            >
              <X size={15} />
            </button>
          </header>
          <AppearanceControls />
        </section>
      )}
    </div>
  )
}
