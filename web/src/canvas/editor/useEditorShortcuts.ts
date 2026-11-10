import { useEffect } from 'react'

import type { CanvasCommand } from './commands'
import { findCommandForShortcut } from './commandShortcuts'
import { isEditableTarget } from './shortcuts'

export function useEditorShortcuts(commands: CanvasCommand[]) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const command = findCommandForShortcut(commands, event, isEditableTarget(event.target))
      if (!command) return
      if (
        event.key === 'Escape'
        && window.document.querySelector('.command-menu-popup, .command-sheet, .appearance-popup, .avatar-popup')
      ) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      command.run(event)
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [commands])
}
