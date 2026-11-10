import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  Download,
  Keyboard,
  LayoutGrid,
  Maximize2,
  Workflow,
  MoreHorizontal,
  PanelsTopLeft,
  PenLine,
  Plus,
  Redo2,
  Sparkles,
  Save,
  ShieldCheck,
  Undo2,
} from 'lucide-react'
import { useState } from 'react'

import { useIsMobile } from '../../useMediaQuery'
import { EDGE_STYLES, setEdgeStyle, useEdgeStyle, type EdgeStyle } from '../model/edgeStyle'

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
  selectedEdge: boolean
  relationValue: string
  relationTypes: ToolbarOption[]
  availableEntityTypes: ToolbarOption[]
  issueCount: number
  errorCount: number
  suggestionCount: number
  onBack: () => void
  backLabel: string
  onUndo: () => void
  onRedo: () => void
  onHelp: () => void
  onRename: () => void
  onRelationChange: (value: string) => void
  onToggleValidation: () => void
  onToggleIntelligence: () => void
  onAddNote: () => void
  onAddCard: () => void
  onAddEntity: (entityTypeId: string) => void
  onAddProcessCanvas: () => void
  onSave: () => void
  onDownload: () => void
  onScreenshot: () => void
  onOpenViews: () => void
  onFitView: () => void
  onAutoLayout: () => void
  onDataFlowLayout: () => void
  onAutoFitAll: () => void
}

function validationLabel(issueCount: number, errorCount: number): string {
  const warningCount = Math.max(0, issueCount - errorCount)
  if (errorCount > 0) return `${errorCount} error${errorCount === 1 ? '' : 's'}`
  return `${warningCount} warning${warningCount === 1 ? '' : 's'}`
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
  const edgeStyle = useEdgeStyle()

  if (isMobile) return <MobileToolbar {...props} edgeStyle={edgeStyle} />

  return <DesktopToolbar {...props} edgeStyle={edgeStyle} />
}

function DesktopToolbar({
  title,
  profileLabel,
  isSystems,
  status,
  canUndo,
  canRedo,
  selectedEdge,
  relationValue,
  relationTypes,
  availableEntityTypes,
  issueCount,
  errorCount,
  suggestionCount,
  onBack,
  backLabel,
  onUndo,
  onRedo,
  onHelp,
  onRename,
  onRelationChange,
  onToggleValidation,
  onToggleIntelligence,
  onAddNote,
  onAddCard,
  onAddEntity,
  onAddProcessCanvas,
  onSave,
  onDownload,
  onScreenshot,
  onOpenViews,
  onAutoLayout,
  onDataFlowLayout,
  onAutoFitAll,
  edgeStyle,
}: CanvasToolbarProps & { edgeStyle: EdgeStyle }) {
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
        <select
          className="template-select"
          aria-label="Canvas layout"
          defaultValue=""
          onChange={(event) => {
            const value = event.target.value
            if (value === 'architecture') onAutoLayout()
            if (value === 'data-flow') onDataFlowLayout()
            if (value === 'fit-cards') onAutoFitAll()
            event.target.value = ''
          }}
        >
          <option value="">Layout</option>
          <option value="architecture">Architecture</option>
          <option value="data-flow">Data flow</option>
          <option value="fit-cards">Fit all cards</option>
        </select>
        <label className="toolbar-field">
          <span>Edges</span>
          <select
            className="template-select"
            aria-label="Edge path style"
            value={edgeStyle}
            onChange={(event) => setEdgeStyle(event.target.value as EdgeStyle)}
          >
            {EDGE_STYLES.map((style) => (
              <option key={style.id} value={style.id}>{style.label}</option>
            ))}
          </select>
        </label>
        <label className="toolbar-field">
          <span>{selectedEdge ? 'Edge relation' : 'New edge'}</span>
          <select
            className="template-select"
            aria-label="Edge relation"
            value={relationValue}
            onChange={(event) => onRelationChange(event.target.value)}
          >
            {isSystems && <option value="">Unspecified</option>}
            {relationTypes.map((relationType) => (
              <option key={relationType.id} value={relationType.id}>{relationType.label}</option>
            ))}
          </select>
        </label>
        {isSystems && (
          <>
            <button
              className="button intelligence-button"
              onClick={onToggleIntelligence}
              aria-label="Canvas intelligence"
              title="Canvas intelligence"
            >
              <Sparkles size={15} />
              {suggestionCount > 0 && <span className="toolbar-count">{suggestionCount}</span>}
            </button>
            <button
              className={`button validation-button${errorCount > 0 ? ' error' : issueCount > 0 ? ' warn' : ''}`}
              onClick={onToggleValidation}
              aria-label="Systems validation"
              title="Systems validation"
            >
              {issueCount > 0 ? <AlertTriangle size={15} /> : <ShieldCheck size={15} />}
              {issueCount > 0 ? validationLabel(issueCount, errorCount) : 'Valid'}
            </button>
          </>
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
        <button className="button" onClick={onSave} disabled={status === 'saving'}>
          <Save size={16} />
          {status === 'saving' ? 'Saving' : 'Save'}
        </button>
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
  selectedEdge,
  relationValue,
  relationTypes,
  availableEntityTypes,
  issueCount,
  errorCount,
  suggestionCount,
  onBack,
  backLabel,
  onUndo,
  onRedo,
  onHelp,
  onRename,
  onRelationChange,
  onToggleValidation,
  onToggleIntelligence,
  onAddNote,
  onAddCard,
  onAddEntity,
  onAddProcessCanvas,
  onSave,
  onDownload,
  onScreenshot,
  onOpenViews,
  onFitView,
  onAutoLayout,
  onDataFlowLayout,
  onAutoFitAll,
  edgeStyle,
}: CanvasToolbarProps & { edgeStyle: EdgeStyle }) {
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
          onClick={onSave}
          disabled={status === 'saving'}
          aria-label="Save"
        >
          <Save size={18} />
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
              <span>{selectedEdge ? 'Edge relation' : 'New edge'}</span>
              <select
                className="template-select"
                aria-label="Edge relation"
                value={relationValue}
                onChange={(event) => onRelationChange(event.target.value)}
              >
                {isSystems && <option value="">Unspecified</option>}
                {relationTypes.map((relationType) => (
                  <option key={relationType.id} value={relationType.id}>{relationType.label}</option>
                ))}
              </select>
            </label>
            {isSystems && (
              <>
                <button
                  className="button intelligence-button"
                  onClick={() => { onToggleIntelligence(); setMoreOpen(false) }}
                >
                  <Sparkles size={15} />
                  {suggestionCount > 0 ? `${suggestionCount} suggestions` : 'Canvas intelligence'}
                </button>
                <button
                  className={`button validation-button${errorCount > 0 ? ' error' : issueCount > 0 ? ' warn' : ''}`}
                  onClick={() => { onToggleValidation(); setMoreOpen(false) }}
                >
                  {issueCount > 0 ? <AlertTriangle size={15} /> : <ShieldCheck size={15} />}
                  {issueCount > 0 ? validationLabel(issueCount, errorCount) : 'Valid'}
                </button>
              </>
            )}
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
                <LayoutGrid size={15} />
                Architecture
              </button>
              <button className="button" onClick={() => { onDataFlowLayout(); setMoreOpen(false) }}>
                <Workflow size={15} />
                Data flow
              </button>
            </div>
            <button className="button" onClick={() => { onAutoFitAll(); setMoreOpen(false) }}>
              <Maximize2 size={15} />
              Fit all cards
            </button>
            <label className="editor-more-field">
              <span>Edge paths</span>
              <select
                className="template-select"
                aria-label="Edge path style"
                value={edgeStyle}
                onChange={(event) => setEdgeStyle(event.target.value as EdgeStyle)}
              >
                {EDGE_STYLES.map((style) => (
                  <option key={style.id} value={style.id}>{style.label}</option>
                ))}
              </select>
            </label>
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
