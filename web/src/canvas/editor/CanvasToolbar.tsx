import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CircleDot,
  CloudOff,
  LoaderCircle,
  MoreHorizontal,
  PenLine,
  Plus,
} from 'lucide-react'
import { useRef, useState, type ComponentType } from 'react'

import { useIsMobile } from '../../useMediaQuery'
import { AppearanceMenu } from '../../AppearanceMenu'
import { AppearanceControls } from '../../AppearanceControls'
import { AvatarMenu, AvatarPanel } from '../../AvatarMenu'
import { CommandMenu, CommandSheet } from './CommandMenu'
import type { CanvasCommand } from './commands'

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'conflict' | 'error' | 'offline'

interface CanvasToolbarProps {
  title: string
  profileLabel: string
  isSystems: boolean
  status: SaveStatus
  commands: CanvasCommand[]
}

function statusLabel(status: SaveStatus): string {
  if (status === 'saving') return 'Saving…'
  if (status === 'dirty') return 'Unsaved changes'
  if (status === 'conflict') return 'Conflict'
  if (status === 'error') return 'Save failed'
  if (status === 'offline') return 'Offline, retrying'
  return 'Saved'
}

const saveIcons: Record<SaveStatus, ComponentType<{ size?: number; className?: string }>> = {
  saved: Check,
  dirty: CircleDot,
  saving: LoaderCircle,
  conflict: AlertTriangle,
  error: AlertTriangle,
  offline: CloudOff,
}

function SaveState({ status }: { status: SaveStatus }) {
  const label = statusLabel(status)
  const Icon = saveIcons[status]
  const showText = status === 'saving' || status === 'offline' || status === 'error' || status === 'conflict'
  return (
    <span className={`save-status ${status}`} role="status" aria-label={label} title={label}>
      <Icon size={16} className="save-status-icon" />
      <span className={`save-status-text${showText ? ' visible' : ''}`}>{label}</span>
    </span>
  )
}

function EditorTitle({ title, rename }: { title: string; rename?: CanvasCommand }) {
  return (
    <div className="editor-toolbar-title">
      <h1 className="canvas-title-heading" aria-label={title}>
        {rename ? (
          <button
            type="button"
            className="canvas-title-button"
            onClick={rename.run}
            aria-label={rename.label}
            title={rename.label}
          >
            <span className="canvas-title-text">{title}</span>
            <PenLine className="canvas-title-pencil" size={14} aria-hidden="true" />
          </button>
        ) : (
          <span className="canvas-title-text">{title}</span>
        )}
      </h1>
    </div>
  )
}

export function CanvasToolbar(props: CanvasToolbarProps) {
  const isMobile = useIsMobile()
  if (isMobile) return <PhoneToolbar {...props} />
  return <DesktopToolbar {...props} />
}

function commandById(commands: CanvasCommand[], id: string): CanvasCommand | undefined {
  return commands.find((command) => command.id === id && command.available)
}

function ReviewButton({ command }: { command: CanvasCommand }) {
  const count = Number(command.label.match(/\d+/)?.[0] ?? 0)
  const level = command.tone === 'error' ? 'error' : 'warning'
  const name = count === 0
    ? 'Review, no warnings'
    : `Review, ${count} ${level === 'error' ? (count === 1 ? 'issue' : 'issues') : (count === 1 ? 'warning' : 'warnings')}`
  const Icon = count === 0 ? Check : command.icon
  return (
    <button
      type="button"
      className={`bar-button bar-review${count === 0 ? ' valid' : ` ${level}`}`}
      onClick={command.run}
      aria-label={name}
      title={name}
    >
      <Icon size={16} />
      <span>{count === 0 ? 'Valid' : 'Review'}</span>
      {count > 0 && <span className={`bar-review-count ${level}`}>{count}</span>}
    </button>
  )
}

function DesktopToolbar({ title, profileLabel, isSystems, status, commands }: CanvasToolbarProps) {
  const back = commandById(commands, 'back')
  const rename = commandById(commands, 'rename')
  const views = commandById(commands, 'views')
  const review = commandById(commands, 'review')
  const undo = commandById(commands, 'undo')
  const redo = commandById(commands, 'redo')
  const addCommands = commands.filter((command) => command.available && command.surface === 'add')
  const overflowCommands = commands.filter((command) => command.available && command.surface === 'overflow')

  return (
    <div className="editor-toolbar desktop-toolbar">
      <div className="bar-zone bar-left">
        {back && (
          <button className="bar-button bar-back" onClick={back.run}>
            <ArrowLeft size={16} />
            <span>{back.label}</span>
          </button>
        )}
        <EditorTitle title={title} rename={rename} />
        <span className={`profile-badge${isSystems ? ' systems' : ''}`}>{profileLabel}</span>
        <SaveState status={status} />
      </div>
      <div className="bar-zone bar-center">
        <div className="bar-group bar-group-primary">
          {addCommands.length > 0 && (
            <CommandMenu label="Add" icon={Plus} commands={addCommands} triggerLabel="Add" />
          )}
          {views && (
            <button className="bar-button" onClick={views.run} aria-label={views.label}>
              <views.icon size={16} />
              <span>{views.label}</span>
            </button>
          )}
          {review && <ReviewButton command={review} />}
        </div>
      </div>
      <div className="bar-zone bar-right">
        <div className="bar-group bar-group-history">
          {undo && (
            <button
              className="bar-icon-button"
              onClick={undo.run}
              disabled={undo.disabled}
              aria-label={undo.label}
              title={undo.label}
            >
              <undo.icon size={16} />
            </button>
          )}
          {redo && (
            <button
              className="bar-icon-button"
              onClick={redo.run}
              disabled={redo.disabled}
              aria-label={redo.label}
              title={redo.label}
            >
              <redo.icon size={16} />
            </button>
          )}
        </div>
        {overflowCommands.length > 0 && (
          <CommandMenu
            label="More"
            icon={MoreHorizontal}
            commands={overflowCommands}
            iconOnly
            triggerLabel="More canvas actions"
          />
        )}
        <span className="bar-divider" aria-hidden="true" />
        <AppearanceMenu />
        <AvatarMenu />
      </div>
    </div>
  )
}

function PhoneToolbar({ title, profileLabel, isSystems, status, commands }: CanvasToolbarProps) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const moreRef = useRef<HTMLButtonElement>(null)
  const back = commandById(commands, 'back')
  const rename = commandById(commands, 'rename')
  const addCommands = commands.filter((command) => command.available && command.surface === 'add')
  const sheetCommands = commands.filter((command) => (
    command.available
    && command.surface !== 'add'
    && command.surface !== 'shortcut'
    && command.id !== 'back'
    && command.id !== 'rename'
  ))

  return (
    <div className="editor-toolbar mobile-toolbar">
      {back && (
        <button className="bar-icon-button mobile-back" onClick={back.run} aria-label={back.label}>
          <ArrowLeft size={16} />
        </button>
      )}
      <EditorTitle title={title} rename={rename} />
      <span className={`profile-badge${isSystems ? ' systems' : ''}`}>{profileLabel}</span>
      <SaveState status={status} />
      <div className="mobile-toolbar-actions">
        {addCommands.length > 0 && (
          <CommandMenu label="Add" icon={Plus} commands={addCommands} iconOnly triggerLabel="Add" />
        )}
        <button
          ref={moreRef}
          type="button"
          className="bar-icon-button"
          aria-label="More canvas actions"
          aria-expanded={sheetOpen}
          onClick={() => setSheetOpen(true)}
        >
          <MoreHorizontal size={16} />
        </button>
      </div>
      <CommandSheet
        open={sheetOpen}
        title="Canvas actions"
        commands={sheetCommands}
        onClose={() => setSheetOpen(false)}
        returnFocusTo={moreRef}
      >
        <AppearanceControls />
        <AvatarPanel />
      </CommandSheet>
    </div>
  )
}
