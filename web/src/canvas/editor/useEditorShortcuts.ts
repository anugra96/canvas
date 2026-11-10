import { useEffect } from 'react'

import { isEditableTarget } from './shortcuts'
import type { CardMenuState, EdgeLabelEditorState, PendingConnection } from './graph/types'

interface UseEditorShortcutsInput {
  helpOpen: boolean
  setHelpOpen: (open: boolean) => void
  pendingConnection: PendingConnection | null
  setPendingConnection: (pending: PendingConnection | null) => void
  cardMenu: CardMenuState | null
  setCardMenu: (menu: CardMenuState | null) => void
  edgeLabelEditor: EdgeLabelEditorState | null
  setEdgeLabelEditor: (editor: EdgeLabelEditorState | null) => void
  clearSelection: () => void
  duplicateSelection: () => void
  selectAll: () => void
  groupSelected: () => void
  fitCanvas: () => void
  zoomSelection: () => void
  nudgeSelection: (dx: number, dy: number) => void
  redo: () => void
  undo: () => void
}

export function useEditorShortcuts({
  helpOpen,
  setHelpOpen,
  pendingConnection,
  setPendingConnection,
  cardMenu,
  setCardMenu,
  edgeLabelEditor,
  setEdgeLabelEditor,
  clearSelection,
  duplicateSelection,
  selectAll,
  groupSelected,
  fitCanvas,
  zoomSelection,
  nudgeSelection,
  redo,
  undo,
}: UseEditorShortcutsInput) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target)) return
      const modifier = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()

      if (!modifier && event.key === '?') {
        event.preventDefault()
        event.stopPropagation()
        setHelpOpen(true)
        return
      }
      if (modifier && key === 'z') {
        event.preventDefault()
        event.stopPropagation()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if (modifier && key === 'y') {
        event.preventDefault()
        event.stopPropagation()
        redo()
        return
      }
      if (modifier && key === 'd') {
        event.preventDefault()
        event.stopPropagation()
        duplicateSelection()
        return
      }
      if (modifier && key === 'a') {
        event.preventDefault()
        event.stopPropagation()
        selectAll()
        return
      }
      if (modifier && key === 'g') {
        event.preventDefault()
        event.stopPropagation()
        groupSelected()
        return
      }
      if (!modifier && event.shiftKey && event.code === 'Digit1') {
        event.preventDefault()
        event.stopPropagation()
        fitCanvas()
        return
      }
      if (!modifier && event.shiftKey && event.code === 'Digit2') {
        event.preventDefault()
        event.stopPropagation()
        zoomSelection()
        return
      }
      if (event.key === 'Escape') {
        if (window.document.querySelector('.command-menu-popup, .command-sheet, .appearance-popup, .avatar-popup')) return
        event.preventDefault()
        event.stopPropagation()
        if (helpOpen) {
          setHelpOpen(false)
        } else if (pendingConnection) {
          setPendingConnection(null)
        } else if (cardMenu) {
          setCardMenu(null)
        } else if (edgeLabelEditor) {
          setEdgeLabelEditor(null)
        } else {
          clearSelection()
        }
        return
      }
      if (event.key.startsWith('Arrow')) {
        event.preventDefault()
        event.stopPropagation()
        const step = event.shiftKey ? 1 : 10
        if (event.key === 'ArrowLeft') nudgeSelection(-step, 0)
        if (event.key === 'ArrowRight') nudgeSelection(step, 0)
        if (event.key === 'ArrowUp') nudgeSelection(0, -step)
        if (event.key === 'ArrowDown') nudgeSelection(0, step)
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [
    cardMenu,
    clearSelection,
    duplicateSelection,
    edgeLabelEditor,
    fitCanvas,
    groupSelected,
    helpOpen,
    nudgeSelection,
    pendingConnection,
    redo,
    selectAll,
    setCardMenu,
    setEdgeLabelEditor,
    setHelpOpen,
    setPendingConnection,
    undo,
    zoomSelection,
  ])
}
