import { ArrowLeft } from 'lucide-react'
import { useEffect, useState } from 'react'

import type { CanvasDocument } from '@skyward/canvas-contract'

import type { CanvasClient } from '../api/client'
import { CanvasEditor } from '../canvas/editor/CanvasEditor'

interface CanvasEditorPageProps {
  client: CanvasClient
  canvasId: string
  onBack: () => void
}

export function CanvasEditorPage({ client, canvasId, onBack }: CanvasEditorPageProps) {
  const [document, setDocument] = useState<CanvasDocument | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    client.getCanvas(canvasId)
      .then((next) => {
        if (active) setDocument(next)
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not load the canvas.')
      })
    return () => {
      active = false
    }
  }, [client, canvasId])

  if (error) {
    return (
      <main className="editor-shell">
        <div className="editor-toolbar">
          <button className="button ghost" onClick={onBack}>
            <ArrowLeft size={16} />
            All canvases
          </button>
        </div>
        <div className="alert editor-alert" role="alert">{error}</div>
      </main>
    )
  }

  if (!document) {
    return (
      <main className="editor-shell">
        <div className="editor-loading">Loading canvas</div>
      </main>
    )
  }

  return <CanvasEditor client={client} document={document} onBack={onBack} />
}
