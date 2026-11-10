interface ShortcutItem {
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
      { keys: ['Delete'], label: 'Delete selection' },
    ],
  },
  {
    title: 'Canvas',
    items: [
      { keys: ['Space', 'Drag'], label: 'Pan canvas' },
      { keys: ['⌘/Ctrl', 'Scroll'], label: 'Zoom canvas' },
    ],
  },
  {
    title: 'Code editing',
    items: [
      { keys: ['Tab'], label: 'Indent code' },
      { keys: ['Shift', 'Tab'], label: 'Outdent code' },
      { keys: ['Enter'], label: 'Auto-indent the next line' },
      { keys: ['⌘/Ctrl', '/'], label: 'Toggle line comment' },
      { keys: ['('], label: 'Auto-close brackets and quotes' },
      { keys: ['Backspace'], label: 'Remove an empty pair' },
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
      { keys: ['Alt', 'Drag'], label: 'Disable alignment snapping' },
      { keys: ['⌘/Ctrl', 'Enter'], label: 'Finish text or code editing' },
    ],
  },
]

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}
