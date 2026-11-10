import type { CanvasCommand } from './commands'

export interface ShortcutBinding {
  key?: string | string[]
  code?: string | string[]
  primary?: boolean
  shift?: boolean
  alt?: boolean
  allowInEditable?: boolean
}

function matchesValue(actual: string, expected: string | string[] | undefined): boolean {
  if (!expected) return true
  const values = Array.isArray(expected) ? expected : [expected]
  return values.some((value) => value.toLowerCase() === actual.toLowerCase())
}

export function shortcutMatches(event: KeyboardEvent, binding: ShortcutBinding): boolean {
  if (!matchesValue(event.key, binding.key)) return false
  if (binding.code && !matchesValue(event.code, binding.code)) return false
  const primary = event.metaKey || event.ctrlKey
  if ((binding.primary ?? false) !== primary) return false
  if (binding.shift !== undefined && binding.shift !== event.shiftKey) return false
  if ((binding.alt ?? false) !== event.altKey) return false
  return true
}

export function findCommandForShortcut(
  commands: CanvasCommand[],
  event: KeyboardEvent,
  editableTarget: boolean,
): CanvasCommand | undefined {
  return commands.find((command) => {
    if (!command.available || command.disabled) return false
    return command.bindings?.some((binding) => (
      (!editableTarget || binding.allowInEditable)
      && shortcutMatches(event, binding)
    ))
  })
}
