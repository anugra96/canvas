import { createContext, useContext } from 'react'

import type { CanvasFlowNode } from '../model/adapter'

export const CanvasNodeIndexContext = createContext<ReadonlyMap<string, CanvasFlowNode>>(new Map())

export function useCanvasNodeIndex(): ReadonlyMap<string, CanvasFlowNode> {
  return useContext(CanvasNodeIndexContext)
}
