import { createContext, useContext } from 'react'

import type { CanvasProfileIssue } from '@canvas/contract'

export interface CanvasValidationState {
  nodeIssues: Map<string, CanvasProfileIssue[]>
  edgeIssues: Map<string, CanvasProfileIssue[]>
  openIssue: (issue: CanvasProfileIssue) => void
}

export const CanvasValidationContext = createContext<CanvasValidationState | null>(null)

export function useCanvasValidation(): CanvasValidationState {
  const value = useContext(CanvasValidationContext)
  if (!value) throw new Error('Canvas validation context is not available.')
  return value
}
