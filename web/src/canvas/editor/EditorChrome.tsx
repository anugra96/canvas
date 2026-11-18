import { X } from 'lucide-react'
import { useEffect } from 'react'

import { CanvasToolbar, type SaveStatus } from './CanvasToolbar'
import type { DisplayControlProps } from './DisplayControl'
import type { CanvasCommand } from './commands'

interface EditorChromeProps {
  trail: Array<{ id: string; label: string }>
  onOpenTrail: (index: number) => void
  title: string
  profileLabel: string
  isSystems: boolean
  status: SaveStatus
  commands: CanvasCommand[]
  display?: DisplayControlProps
  notice: string
  onDismissNotice: () => void
  error: string
}

export function EditorChrome({
  trail,
  onOpenTrail,
  title,
  profileLabel,
  isSystems,
  status,
  commands,
  display,
  notice,
  onDismissNotice,
  error,
}: EditorChromeProps) {
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(onDismissNotice, 5_000)
    return () => window.clearTimeout(timer)
  }, [notice, onDismissNotice])

  return (
    <>
      {trail.length > 1 && (
        <nav className="editor-trail" aria-label="Canvas trail">
          <button onClick={() => onOpenTrail(-1)}>Canvases</button>
          {trail.map((entry, index) => (
            index === trail.length - 1
              ? <span key={entry.id}>{entry.label}</span>
              : <button key={entry.id} onClick={() => onOpenTrail(index)}>{entry.label}</button>
          ))}
        </nav>
      )}
      <CanvasToolbar
        title={title}
        profileLabel={profileLabel}
        isSystems={isSystems}
        status={status}
        commands={commands}
        display={display}
      />

      {notice && (
        <div className="editor-notice" role="status">
          <span>{notice}</span>
          <button className="icon-button" onClick={onDismissNotice} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}

      {error && <div className="alert editor-alert" role="alert">{error}</div>}
    </>
  )
}
