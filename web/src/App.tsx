import { LogOut } from 'lucide-react'
import { lazy, Suspense, useMemo, useState } from 'react'

import { createCanvasClient } from './api/client'
import { useAuth } from './auth/AuthContext'
import { mockAuthEnabled } from './auth/auth'
import { CanvasListPage } from './pages/CanvasListPage'
import { ThemePicker } from './ThemePicker'
import { AmbiencePicker } from './AmbiencePicker'

const CanvasEditorPage = lazy(() => import('./pages/CanvasEditorPage').then((module) => ({
  default: module.CanvasEditorPage,
})))

export default function App() {
  const { session, signOut } = useAuth()
  const client = useMemo(() => createCanvasClient(session), [session])
  const [canvasTrail, setCanvasTrail] = useState<Array<{ id: string; label: string }>>([])
  const selectedCanvasId = canvasTrail.at(-1)?.id ?? null

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setCanvasTrail([])}>
          <span className="brand-mark">C</span>
          <span>
            <strong>Canvas</strong>
            <small>Workspace</small>
          </span>
        </button>
        <div className="topbar-actions">
          <ThemePicker />
          <AmbiencePicker />
          {mockAuthEnabled() && <span className="local-badge">Local mode</span>}
          <span className="user-chip">
            <span>{session.displayName}</span>
            <small>{session.email}</small>
          </span>
          <button className="icon-button" onClick={signOut} aria-label="Sign out">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {selectedCanvasId ? (
        <Suspense fallback={<main className="editor-shell"><div className="editor-loading">Loading canvas</div></main>}>
          <CanvasEditorPage
            client={client}
            canvasId={selectedCanvasId}
            trail={canvasTrail}
            onBack={() => setCanvasTrail((current) => current.length > 1 ? current.slice(0, -1) : [])}
            onOpenTrail={(index) => setCanvasTrail((current) => index < 0 ? [] : current.slice(0, index + 1))}
            onOpenLinkedCanvas={(canvasId, label) => setCanvasTrail((current) => (
              current.some((entry) => entry.id === canvasId)
                ? current
                : [...current, { id: canvasId, label }]
            ))}
          />
        </Suspense>
      ) : (
        <CanvasListPage client={client} onOpen={(id, title) => setCanvasTrail([{ id, label: title }])} />
      )}
    </div>
  )
}
