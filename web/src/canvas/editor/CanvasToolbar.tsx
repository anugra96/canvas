import { ArrowLeft, MoreHorizontal, PenLine, Plus } from 'lucide-react'
import { useRef, useState } from 'react'

import { useIsMobile } from '../../useMediaQuery'
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
  if (status === 'saving') return 'Saving'
  if (status === 'dirty') return 'Unsaved changes'
  if (status === 'conflict') return 'Conflict'
  if (status === 'error') return 'Save failed'
  if (status === 'offline') return 'Offline, retrying'
  return 'Saved'
}

export function CanvasToolbar(props: CanvasToolbarProps) {
  const isMobile = useIsMobile()
  if (isMobile) return <PhoneToolbar {...props} />
  return <DesktopToolbar {...props} />
}

function commandById(commands: CanvasCommand[], id: string): CanvasCommand | undefined {
  return commands.find((command) => command.id === id)
}

function commandButtonClass(command: CanvasCommand): string {
  if (command.id !== 'review') return 'button'
  if (command.tone === 'error') return 'button command-review error'
  if (command.tone === 'warning') return 'button command-review warn'
  return 'button command-review valid'
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
    <div className="editor-toolbar">
      {back && (
        <button className="button ghost" onClick={back.run}>
          <ArrowLeft size={16} />
          {back.label}
        </button>
      )}
      <div className="editor-toolbar-title">
        <h1>{title}</h1>
        {rename && (
          <button
            className="icon-button canvas-title-rename"
            onClick={rename.run}
            aria-label={rename.label}
            title={rename.label}
          >
            <PenLine size={13} />
          </button>
        )}
        <span className={`profile-badge${isSystems ? ' systems' : ''}`}>{profileLabel}</span>
        <span className={`save-status ${status}`}>{statusLabel(status)}</span>
      </div>
      <div className="editor-actions">
        {addCommands.length > 0 && (
          <CommandMenu label="Add" icon={Plus} commands={addCommands} triggerLabel="Add" />
        )}
        {views && (
          <button className="button" onClick={views.run} aria-label={views.label}>
            <views.icon size={15} />
            {views.label}
          </button>
        )}
        {review && (
          <button
            className={commandButtonClass(review)}
            onClick={review.run}
            aria-label={review.label}
          >
            <review.icon size={15} />
            {review.label}
          </button>
        )}
        {undo && (
          <button
            className="icon-button"
            onClick={undo.run}
            disabled={undo.disabled}
            aria-label={undo.label}
            title={undo.label}
          >
            <undo.icon size={15} />
          </button>
        )}
        {redo && (
          <button
            className="icon-button"
            onClick={redo.run}
            disabled={redo.disabled}
            aria-label={redo.label}
            title={redo.label}
          >
            <redo.icon size={15} />
          </button>
        )}
        {overflowCommands.length > 0 && (
          <CommandMenu
            label="More"
            icon={MoreHorizontal}
            commands={overflowCommands}
            iconOnly
            triggerLabel="More canvas actions"
          />
        )}
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
        <button className="button ghost mobile-back" onClick={back.run} aria-label={back.label}>
          <ArrowLeft size={18} />
        </button>
      )}
      <div className="editor-toolbar-title">
        <h1>{title}</h1>
        {rename && (
          <button
            className="icon-button canvas-title-rename"
            onClick={rename.run}
            aria-label={rename.label}
            title={rename.label}
          >
            <PenLine size={13} />
          </button>
        )}
        <span className={`profile-badge${isSystems ? ' systems' : ''}`}>{profileLabel}</span>
        <span className={`save-status ${status}`}>{statusLabel(status)}</span>
      </div>
      <div className="mobile-toolbar-actions">
        {addCommands.length > 0 && (
          <CommandMenu label="Add" icon={Plus} commands={addCommands} iconOnly triggerLabel="Add" />
        )}
        <button
          ref={moreRef}
          type="button"
          className="icon-button"
          aria-label="More canvas actions"
          aria-expanded={sheetOpen}
          onClick={() => setSheetOpen(true)}
        >
          <MoreHorizontal size={18} />
        </button>
      </div>
      <CommandSheet
        open={sheetOpen}
        title="Canvas actions"
        commands={sheetCommands}
        onClose={() => setSheetOpen(false)}
        returnFocusTo={moreRef}
      />
    </div>
  )
}
