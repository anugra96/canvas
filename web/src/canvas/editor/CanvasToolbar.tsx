import {
  ArrowLeft,
  Camera,
  Download,
  Keyboard,
  Maximize2,
  MoreHorizontal,
  PanelsTopLeft,
  PenLine,
  Plus,
  Redo2,
  Undo2,
} from 'lucide-react'
import { useState } from 'react'

import { useIsMobile } from '../../useMediaQuery'

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'conflict' | 'error' | 'offline'

interface ToolbarOption {
  id: string
  label: string
}

interface CanvasToolbarProps {
  title: string
  profileLabel: string
  isSystems: boolean
  status: SaveStatus
  canUndo: boolean
  canRedo: boolean
  availableEntityTypes: ToolbarOption[]
  onBack: () => void
  backLabel: string
  onUndo: () => void
  onRedo: () => void
  onHelp: () => void
  onRename: () => void
  onAddNote: () => void
  onAddCard: () => void
  onAddEntity: (entityTypeId: string) => void
  onAddProcessCanvas: () => void
  onDownload: () => void
  onScreenshot: () => void
  onOpenViews: () => void
  onFitView: () => void
  onAutoLayout: () => void
  onAutoFitAll: () => void
}

function statusLabel(status: SaveStatus): string {
  if (status === 'saving') return 'Saving'
  if (status === 'dirty') return 'Unsaved changes'
  if (status === 'conflict') return 'Conflict'
  if (status === 'error') return 'Save failed'
  if (status === 'offline') return 'Offline, retrying'
  return 'Saved'
}

export function CanvasToolbar(props: CanvasToolbarProps) {
  const isMobile = useIsMobile()

  if (isMobile) return <MobileToolbar {...props} />

  return <DesktopToolbar {...props} />
}

function DesktopToolbar({
  title,
  profileLabel,
  isSystems,
  status,
  canUndo,
  canRedo,
  availableEntityTypes,
  onBack,
  backLabel,
  onUndo,
  onRedo,
  onHelp,
  onRename,
  onAddNote,
  onAddCard,
  onAddEntity,
  onAddProcessCanvas,
  onDownload,
  onScreenshot,
  onOpenViews,
}: CanvasToolbarProps) {
  return (
    <div className="editor-toolbar">
      <button className="button ghost" onClick={onBack}>
        <ArrowLeft size={16} />
        {backLabel}
      </button>
      <div className="editor-toolbar-title">
        <h1>{title}</h1>
        <button
          className="icon-button canvas-title-rename"
          onClick={onRename}
          aria-label="Edit canvas title"
          title="Edit canvas title"
        >
          <PenLine size={13} />
        </button>
        <span className={`profile-badge${isSystems ? ' systems' : ''}`}>{profileLabel}</span>
        <span className={`save-status ${status}`}>{statusLabel(status)}</span>
      </div>
      <div className="editor-actions">
        <button
          className="icon-button"
          aria-label="Undo"
          title="Undo"
          onClick={onUndo}
          disabled={!canUndo}
        >
          <Undo2 size={15} />
        </button>
        <button
          className="icon-button"
          aria-label="Redo"
          title="Redo"
          onClick={onRedo}
          disabled={!canRedo}
        >
          <Redo2 size={15} />
        </button>
        <button
          className="icon-button"
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts"
          onClick={onHelp}
        >
          <Keyboard size={15} />
        </button>
        <button
          className="icon-button"
          aria-label="Screenshot"
          title="Screenshot"
          onClick={onScreenshot}
        >
          <Camera size={15} />
        </button>
        {isSystems && (
          <button
            className="button"
            onClick={onOpenViews}
            aria-label="Derived views"
            title="Derived views"
          >
            <PanelsTopLeft size={15} />
            Views
          </button>
        )}
        {isSystems ? (
          <button className="button" onClick={onAddNote}>
            <Plus size={16} />
            Add note
          </button>
        ) : (
          <button className="button" onClick={onAddCard}>
            <Plus size={16} />
            Add card
          </button>
        )}
        <select
          className="template-select"
          aria-label="Add template"
          defaultValue=""
          onChange={(event) => {
            const value = event.target.value
            if (value === 'process-canvas') onAddProcessCanvas()
            else if (value) onAddEntity(value)
            event.target.value = ''
          }}
        >
          <option value="">{isSystems ? 'Add architecture card' : 'Add template'}</option>
          {isSystems && <option value="process-canvas">Process with canvas</option>}
          {availableEntityTypes.map((entityType) => (
            <option key={entityType.id} value={entityType.id}>{entityType.label}</option>
          ))}
        </select>
        <button className="button" onClick={onDownload}>
          <Download size={16} />
          .canvas
        </button>
      </div>
    </div>
  )
}

function MobileToolbar({
  title,
  profileLabel,
  isSystems,
  status,
  canUndo,
  canRedo,
  availableEntityTypes,
  onBack,
  backLabel,
  onUndo,
  onRedo,
  onHelp,
  onRename,
  onAddNote,
  onAddCard,
  onAddEntity,
  onAddProcessCanvas,
  onDownload,
  onScreenshot,
  onOpenViews,
  onFitView,
  onAutoLayout,
  onAutoFitAll,
}: CanvasToolbarProps) {
  const [moreOpen, setMoreOpen] = useState(false)
  const addLabel = isSystems ? 'Add note' : 'Add card'

  function chooseEntity(entityTypeId: string) {
    onAddEntity(entityTypeId)
    setMoreOpen(false)
  }

  return (
    <div className="editor-toolbar mobile-toolbar">
      <button className="button ghost mobile-back" onClick={onBack} aria-label={backLabel}>
        <ArrowLeft size={18} />
      </button>
      <div className="editor-toolbar-title">
        <h1>{title}</h1>
        <button
          className="icon-button canvas-title-rename"
          onClick={onRename}
          aria-label="Edit canvas title"
          title="Edit canvas title"
        >
          <PenLine size={13} />
        </button>
        <span className={`profile-badge${isSystems ? ' systems' : ''}`}>{profileLabel}</span>
        <span className={`save-status ${status}`}>{statusLabel(status)}</span>
      </div>
      <div className="mobile-toolbar-actions">
        <button className="icon-button" onClick={isSystems ? onAddNote : onAddCard} aria-label={addLabel}>
          <Plus size={18} />
        </button>
        <button
          className="icon-button"
          onClick={() => setMoreOpen((open) => !open)}
          aria-label="More editor actions"
          aria-expanded={moreOpen}
        >
          <MoreHorizontal size={18} />
        </button>
      </div>

      {moreOpen && (
        <>
          <button
            className="editor-more-backdrop"
            onClick={() => setMoreOpen(false)}
            aria-label="Close editor actions"
          />
          <div className="editor-more-menu" role="dialog" aria-label="Editor actions">
            <div className="editor-more-row">
              <button
                className="button"
                onClick={() => { onUndo(); setMoreOpen(false) }}
                disabled={!canUndo}
              >
                <Undo2 size={15} />
                Undo
              </button>
              <button
                className="button"
                onClick={() => { onRedo(); setMoreOpen(false) }}
                disabled={!canRedo}
              >
                <Redo2 size={15} />
                Redo
              </button>
            </div>
            <label className="editor-more-field">
              <span>{isSystems ? 'Add architecture card' : 'Add template'}</span>
              <select
                className="template-select"
                defaultValue=""
                aria-label={isSystems ? 'Add architecture card' : 'Add template'}
                onChange={(event) => {
                  if (event.target.value === 'process-canvas') {
                    onAddProcessCanvas()
                    setMoreOpen(false)
                  } else if (event.target.value) {
                    chooseEntity(event.target.value)
                  }
                }}
              >
                <option value="">Choose a card</option>
                {isSystems && <option value="process-canvas">Process with canvas</option>}
                {availableEntityTypes.map((entityType) => (
                  <option key={entityType.id} value={entityType.id}>{entityType.label}</option>
                ))}
              </select>
            </label>
            {isSystems && (
              <button
                className="button"
                onClick={() => { onOpenViews(); setMoreOpen(false) }}
                aria-label="Derived views"
              >
                <PanelsTopLeft size={15} />
                Derived views
              </button>
            )}
            <div className="editor-more-row">
              <button className="button" onClick={() => { onAutoLayout(); setMoreOpen(false) }}>
                <Maximize2 size={15} />
                Architecture
              </button>
              <button className="button" onClick={() => { onAutoFitAll(); setMoreOpen(false) }}>
                <Maximize2 size={15} />
                Fit all cards
              </button>
            </div>
            <div className="editor-more-row">
              <button className="button" onClick={() => { onFitView(); setMoreOpen(false) }}>
                <Maximize2 size={15} />
                Fit view
              </button>
              <button className="button" onClick={() => { onScreenshot(); setMoreOpen(false) }}>
                <Camera size={15} />
                Screenshot
              </button>
            </div>
            <div className="editor-more-row">
              <button className="button" onClick={() => { onDownload(); setMoreOpen(false) }}>
                <Download size={15} />
                Download
              </button>
              <button className="button" onClick={() => { onHelp(); setMoreOpen(false) }}>
                <Keyboard size={15} />
                Shortcuts
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
