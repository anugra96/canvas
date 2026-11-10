import {
  AlertTriangle,
  ArrowLeft,
  Box,
  Camera,
  Download,
  Keyboard,
  LayoutGrid,
  Maximize2,
  PanelsTopLeft,
  PenLine,
  Redo2,
  Save,
  ShieldCheck,
  StickyNote,
  Type,
  Undo2,
  Workflow,
  type LucideIcon,
} from 'lucide-react'

export type CommandSurface = 'bar' | 'add' | 'overflow' | 'shortcut'

export interface CanvasCommand {
  id: string
  label: string
  icon: LucideIcon
  surface: CommandSurface
  shortcut?: string[]
  available: boolean
  disabled?: boolean
  tone?: 'warning' | 'error' | 'valid'
  section?: 'layout' | 'export' | 'help'
  run: () => void
}

interface CanvasCommandInput {
  backLabel: string
  isSystems: boolean
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
  onFitCards: () => void
  onFitView: () => void
  onDownload: () => void
  onScreenshot: () => void
  onHelp: () => void
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
      available: input.isSystems,
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
      available: true,
      run: input.onSave,
    },
    {
      id: 'layout.tidy',
      label: 'Tidy layout',
      icon: LayoutGrid,
      surface: 'overflow',
      section: 'layout',
      available: true,
      run: input.onTidy,
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
      available: true,
      run: input.onHelp,
    },
  ]
}
