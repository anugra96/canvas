import { LogOut } from 'lucide-react'
import { useMemo, useState } from 'react'

import { createCanvasClient } from './api/client'
import { useAuth } from './auth/AuthContext'
import { mockAuthEnabled } from './auth/auth'
import { CanvasEditorPage } from './pages/CanvasEditorPage'
import { CanvasListPage } from './pages/CanvasListPage'

export default function App() {
  const { session, signOut } = useAuth()
  const client = useMemo(() => createCanvasClient(session), [session])
  const [selectedCanvasId, setSelectedCanvasId] = useState<string | null>(null)

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setSelectedCanvasId(null)}>
          <span className="brand-mark">C</span>
          <span>
            <strong>Canvas</strong>
            <small>Workspace</small>
          </span>
        </button>
        <div className="topbar-actions">
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
        <CanvasEditorPage
          client={client}
          canvasId={selectedCanvasId}
          onBack={() => setSelectedCanvasId(null)}
        />
      ) : (
        <CanvasListPage client={client} onOpen={setSelectedCanvasId} />
      )}
    </div>
  )
}
