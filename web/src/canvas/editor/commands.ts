import {
  AlertTriangle,
  ArrowLeft,
  Box,
  Camera,
  Copy,
  Download,
  Group as GroupIcon,
  Keyboard,
  LayoutGrid,
  Maximize2,
  MousePointer2,
  Move,
  PanelsTopLeft,
  PenLine,
  Redo2,
  Save,
  ShieldCheck,
  StickyNote,
  Type,
  Undo2,
  Workflow,
  X,
  type LucideIcon,
} from 'lucide-react'

import type { ShortcutBinding } from './commandShortcuts'

type CommandSurface = 'bar' | 'add' | 'overflow' | 'shortcut'

export interface CanvasCommand {
  id: string
  label: string
  icon: LucideIcon
  surface: CommandSurface
  shortcut?: string[]
  bindings?: ShortcutBinding[]
  available: boolean
  disabled?: boolean
  tone?: 'warning' | 'error' | 'valid'
  section?: 'layout' | 'export' | 'help'
  run: (event?: { key?: string; shiftKey?: boolean }) => void
}

interface CanvasCommandInput {
  backLabel: string
  isSystems: boolean
  profileId: string
  issueCount: number
  errorCount: number
  canUndo: boolean
  canRedo: boolean
  availableEntityTypes: Array<{ id: string; label: string }>
  onBack: () => void
  onRename: () => void
  onAddNote: () => void
  onAddCard: () => void
  onAddEntity: (entityTypeId: string) => void
  onAddProcessCanvas: () => void
  onViews: () => void
  onReview: () => void
  onUndo: () => void
  onRedo: () => void
  onSave: () => void
  onTidy: () => void
  onTidyApi: () => void
  onFitCards: () => void
  onFitView: () => void
  onDownload: () => void
  onScreenshot: () => void
  onHelp: () => void
  onDuplicate: () => void
  onSelectAll: () => void
  onGroup: () => void
  onNudge: (dx: number, dy: number) => void
  onZoomSelection: () => void
  onDismiss: () => void
}

function reviewCommand(input: CanvasCommandInput): CanvasCommand {
  if (input.issueCount === 0) {
    return {
      id: 'review',
      label: 'Valid',
      icon: ShieldCheck,
      surface: 'bar',
      available: input.isSystems,
      tone: 'valid',
      run: input.onReview,
    }
  }
  return {
    id: 'review',
    label: `Review ${input.issueCount}`,
    icon: AlertTriangle,
    surface: 'bar',
    available: input.isSystems,
    tone: input.errorCount > 0 ? 'error' : 'warning',
    run: input.onReview,
  }
}

export function useCanvasCommands(input: CanvasCommandInput): CanvasCommand[] {
  return [
    {
      id: 'back',
      label: input.backLabel,
      icon: ArrowLeft,
      surface: 'bar',
      available: true,
      run: input.onBack,
    },
    {
      id: 'rename',
      label: 'Rename canvas',
      icon: PenLine,
      surface: 'bar',
      available: true,
      run: input.onRename,
    },
    {
      id: 'add.note',
      label: 'Note',
      icon: StickyNote,
      surface: 'add',
      available: input.isSystems,
      run: input.onAddNote,
    },
    {
      id: 'add.card',
      label: 'Text card',
      icon: Type,
      surface: 'add',
      available: !input.isSystems,
      run: input.onAddCard,
    },
    ...input.availableEntityTypes
      .filter((entityType) => !(input.isSystems && entityType.id === 'note'))
      .map((entityType) => ({
        id: `add.entity.${entityType.id}`,
        label: entityType.label,
        icon: Box,
        surface: 'add' as const,
        available: true,
        run: () => input.onAddEntity(entityType.id),
      })),
    {
      id: 'add.process-canvas',
      label: 'Process with canvas',
      icon: Workflow,
      surface: 'add',
      available: input.profileId === 'systems',
      run: input.onAddProcessCanvas,
    },
    {
      id: 'views',
      label: 'Views',
      icon: PanelsTopLeft,
      surface: 'bar',
      available: input.isSystems,
      run: input.onViews,
    },
    reviewCommand(input),
    {
      id: 'undo',
      label: 'Undo',
      icon: Undo2,
      surface: 'bar',
      shortcut: ['⌘/Ctrl', 'Z'],
      bindings: [{ key: 'z', primary: true, shift: false }],
      available: true,
      disabled: !input.canUndo,
      run: input.onUndo,
    },
    {
      id: 'redo',
      label: 'Redo',
      icon: Redo2,
      surface: 'bar',
      shortcut: ['⌘/Ctrl', 'Shift', 'Z'],
      bindings: [
        { key: 'z', primary: true, shift: true },
        { key: 'y', primary: true, shift: false },
      ],
      available: true,
      disabled: !input.canRedo,
      run: input.onRedo,
    },
    {
      id: 'save',
      label: 'Save now',
      icon: Save,
      surface: 'shortcut',
      shortcut: ['⌘/Ctrl', 'S'],
      bindings: [{ key: 's', primary: true, allowInEditable: true }],
      available: true,
      run: input.onSave,
    },
    {
      id: 'layout.tidy',
      label: 'Tidy layout',
      icon: LayoutGrid,
      surface: 'overflow',
      section: 'layout',
      available: input.profileId !== 'api',
      run: input.onTidy,
    },
    {
      id: 'layout.tidy-api',
      label: 'Tidy API layout',
      icon: LayoutGrid,
      surface: 'overflow',
      section: 'layout',
      available: input.profileId === 'api',
      run: input.onTidyApi,
    },
    {
      id: 'layout.fit-cards',
      label: 'Fit cards to content',
      icon: Maximize2,
      surface: 'overflow',
      section: 'layout',
      available: true,
      run: input.onFitCards,
    },
    {
      id: 'view.fit',
      label: 'Zoom to fit',
      icon: Maximize2,
      surface: 'overflow',
      shortcut: ['Shift', '1'],
      bindings: [{ code: 'Digit1', shift: true }],
      available: true,
      run: input.onFitView,
    },
    {
      id: 'export.canvas',
      label: 'Download .canvas',
      icon: Download,
      surface: 'overflow',
      section: 'export',
      available: true,
      run: input.onDownload,
    },
    {
      id: 'export.image',
      label: 'Screenshot',
      icon: Camera,
      surface: 'overflow',
      section: 'export',
      available: true,
      run: input.onScreenshot,
    },
    {
      id: 'help.shortcuts',
      label: 'Keyboard shortcuts',
      icon: Keyboard,
      surface: 'overflow',
      section: 'help',
      shortcut: ['?'],
      bindings: [{ key: '?' }],
      available: true,
      run: input.onHelp,
    },
    {
      id: 'selection.duplicate',
      label: 'Duplicate selection',
      icon: Copy,
      surface: 'shortcut',
      shortcut: ['⌘/Ctrl', 'D'],
      bindings: [{ key: 'd', primary: true }],
      available: true,
      run: input.onDuplicate,
    },
    {
      id: 'selection.all',
      label: 'Select all',
      icon: MousePointer2,
      surface: 'shortcut',
      shortcut: ['⌘/Ctrl', 'A'],
      bindings: [{ key: 'a', primary: true }],
      available: true,
      run: input.onSelectAll,
    },
    {
      id: 'selection.group',
      label: 'Group selection',
      icon: GroupIcon,
      surface: 'shortcut',
      shortcut: ['⌘/Ctrl', 'G'],
      bindings: [{ key: 'g', primary: true }],
      available: true,
      run: input.onGroup,
    },
    {
      id: 'selection.nudge',
      label: 'Nudge selection (Shift = 1 px)',
      icon: Move,
      surface: 'shortcut',
      shortcut: ['Arrow'],
      bindings: [{ key: ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'] }],
      available: true,
      run: (event) => {
        const step = event?.shiftKey ? 1 : 10
        if (event?.key === 'ArrowLeft') input.onNudge(-step, 0)
        if (event?.key === 'ArrowRight') input.onNudge(step, 0)
        if (event?.key === 'ArrowUp') input.onNudge(0, -step)
        if (event?.key === 'ArrowDown') input.onNudge(0, step)
      },
    },
    {
      id: 'view.selection',
      label: 'Zoom to selection',
      icon: Maximize2,
      surface: 'shortcut',
      shortcut: ['Shift', '2'],
      bindings: [{ code: 'Digit2', shift: true }],
      available: true,
      run: input.onZoomSelection,
    },
    {
      id: 'editor.dismiss',
      label: 'Clear selection or close menu',
      icon: X,
      surface: 'shortcut',
      shortcut: ['Esc'],
      bindings: [{ key: 'Escape' }],
      available: true,
      run: input.onDismiss,
    },
  ]
}
