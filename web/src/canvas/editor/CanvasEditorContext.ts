import { createContext, useContext } from 'react'

export interface CanvasEditorActions {
  updateText: (id: string, text: string) => void
  updateLabel: (id: string, label: string) => void
  updateEntityField: (id: string, fieldKey: string, value: string) => void
  resizeNode: (id: string, width: number, height: number) => void
  autoFitNode: (id: string) => void
  editEdgeLabel: (id: string, clientX: number, clientY: number) => void
  selectEdge: (id: string) => void
}

export const CanvasEditorActionsContext = createContext<CanvasEditorActions | null>(null)

export function useCanvasEditorActions(): CanvasEditorActions {
  const actions = useContext(CanvasEditorActionsContext)
  if (!actions) throw new Error('Canvas editor actions are not available.')
  return actions
}
