export interface ShortcutItem {
  keys: string[]
  label: string
}

export interface ShortcutGroup {
  title: string
  items: ShortcutItem[]
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Editing',
    items: [
      { keys: ['⌘/Ctrl', 'Z'], label: 'Undo' },
      { keys: ['⌘/Ctrl', 'Shift', 'Z'], label: 'Redo' },
      { keys: ['⌘/Ctrl', 'D'], label: 'Duplicate selection' },
      { keys: ['⌘/Ctrl', 'A'], label: 'Select all' },
      { keys: ['⌘/Ctrl', 'G'], label: 'Group selection' },
      { keys: ['Delete'], label: 'Delete selection' },
      { keys: ['Esc'], label: 'Clear selection or finish editing' },
    ],
  },
  {
    title: 'Canvas',
    items: [
      { keys: ['Space', 'Drag'], label: 'Pan canvas' },
      { keys: ['⌘/Ctrl', 'Scroll'], label: 'Zoom canvas' },
      { keys: ['Shift', '1'], label: 'Zoom to fit' },
      { keys: ['Shift', '2'], label: 'Zoom to selection' },
      { keys: ['?'], label: 'Show keyboard shortcuts' },
    ],
  },
  {
    title: 'Markdown editing',
    items: [
      { keys: ['Enter'], label: 'Continue a list or blockquote' },
      { keys: ['Tab'], label: 'Indent a list item' },
      { keys: ['Shift', 'Tab'], label: 'Outdent a list item' },
      { keys: ['⌘/Ctrl', 'B'], label: 'Bold' },
      { keys: ['⌘/Ctrl', 'I'], label: 'Italic' },
      { keys: ['⌘/Ctrl', 'E'], label: 'Inline code' },
    ],
  },
  {
    title: 'Cards and edges',
    items: [
      { keys: ['Double-click'], label: 'Create a card or edit a card' },
      { keys: ['Double-click', 'Edge'], label: 'Edit an edge label' },
      { keys: ['Drag endpoint'], label: 'Reconnect an edge' },
      { keys: ['Drag'], label: 'Move a card or selection' },
      { keys: ['Drag handle'], label: 'Resize a card' },
      { keys: ['Arrow'], label: 'Nudge selection by 10 px' },
      { keys: ['Shift', 'Arrow'], label: 'Nudge selection by 1 px' },
      { keys: ['Alt', 'Drag'], label: 'Disable alignment snapping' },
      { keys: ['⌘/Ctrl', 'Enter'], label: 'Finish text or code editing' },
    ],
  },
]

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}
