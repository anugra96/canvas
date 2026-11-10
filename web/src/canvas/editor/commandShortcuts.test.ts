import { describe, expect, it } from 'vitest'

import type { CanvasCommand } from './commands'
import { findCommandForShortcut } from './commandShortcuts'

const commands = [
  {
    id: 'undo',
    bindings: [{ key: 'z', primary: true, shift: false }],
    available: true,
    run: () => {},
  },
  {
    id: 'save',
    bindings: [{ key: 's', primary: true, allowInEditable: true }],
    available: true,
    run: () => {},
  },
  {
    id: 'fit',
    bindings: [{ code: 'Digit1', shift: true }],
    available: true,
    run: () => {},
  },
  {
    id: 'help',
    bindings: [{ key: '?' }],
    available: true,
    run: () => {},
  },
  {
    id: 'disabled',
    bindings: [{ key: 'd', primary: true }],
    disabled: true,
    available: true,
    run: () => {},
  },
] as CanvasCommand[]

function keyboardEvent(
  key: string,
  options: { code?: string; meta?: boolean; ctrl?: boolean; shift?: boolean; alt?: boolean } = {},
): KeyboardEvent {
  return {
    key,
    code: options.code ?? '',
    metaKey: options.meta ?? false,
    ctrlKey: options.ctrl ?? false,
    shiftKey: options.shift ?? false,
    altKey: options.alt ?? false,
  } as KeyboardEvent
}

describe('findCommandForShortcut', () => {
  it.each([
    {
      name: 'matches the primary modifier on Meta or Control',
      event: keyboardEvent('z', { meta: true }),
      editable: false,
      expected: 'undo',
    },
    {
      name: 'matches Control as the primary modifier',
      event: keyboardEvent('z', { ctrl: true }),
      editable: false,
      expected: 'undo',
    },
    {
      name: 'rejects a non-primary letter',
      event: keyboardEvent('z'),
      editable: false,
      expected: undefined,
    },
    {
      name: 'supports editable targets only when declared',
      event: keyboardEvent('s', { meta: true }),
      editable: true,
      expected: 'save',
    },
    {
      name: 'keeps the guard for other commands in editors',
      event: keyboardEvent('z', { meta: true }),
      editable: true,
      expected: undefined,
    },
    {
      name: 'matches Shift plus a physical digit',
      event: keyboardEvent('!', { code: 'Digit1', shift: true }),
      editable: false,
      expected: 'fit',
    },
    {
      name: 'matches shifted punctuation from the key value',
      event: keyboardEvent('?', { shift: true }),
      editable: false,
      expected: 'help',
    },
    {
      name: 'ignores disabled commands',
      event: keyboardEvent('d', { meta: true }),
      editable: false,
      expected: undefined,
    },
  ])('$name', ({ event, editable, expected }) => {
    expect(findCommandForShortcut(commands, event, editable)?.id).toBe(expected)
  })
})
