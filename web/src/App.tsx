import { lazy, Suspense, useMemo } from 'react'

import { createCanvasClient } from './api/client'
import { useAuth } from './auth/AuthContext'
import { CanvasListPage } from './pages/CanvasListPage'
import { AppearanceMenu } from './AppearanceMenu'
import { AvatarMenu } from './AvatarMenu'
import { useCanvasTrail } from './navigation'

const CanvasEditorPage = lazy(() => import('./pages/CanvasEditorPage').then((module) => ({
  default: module.CanvasEditorPage,
})))

export default function App() {
  const { session } = useAuth()
  const client = useMemo(() => createCanvasClient(session), [session])
  const [canvasTrail, setCanvasTrail] = useCanvasTrail()
  const selectedCanvasId = canvasTrail.at(-1)?.id ?? null

  return (
    <div className={`app-shell${selectedCanvasId ? ' editing' : ''}`}>
      <header className="topbar">
        <button className="brand" onClick={() => setCanvasTrail(() => [])}>
          <span className="brand-mark">C</span>
          <span>
            <strong>Canvas</strong>
            <small>Workspace</small>
          </span>
        </button>
        <div className="topbar-actions">
          <AppearanceMenu />
          <AvatarMenu />
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
        <CanvasListPage client={client} onOpen={(id, title) => setCanvasTrail(() => [{ id, label: title }])} />
      )}
    </div>
  )
}
