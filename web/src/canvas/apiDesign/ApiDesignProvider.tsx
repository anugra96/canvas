import { useMemo, type ReactNode } from 'react'

import { buildApiReferenceDocument } from '@canvas/contract'

import type { CanvasFlowNode } from '../model/adapter'
import { ApiDesignContext } from './ApiDesignContext'

export function ApiDesignProvider({
  nodes,
  enabled,
  children,
}: {
  nodes: CanvasFlowNode[]
  enabled: boolean
  children: ReactNode
}) {
  const value = useMemo(
    () => (enabled ? buildApiReferenceDocument(nodes.map((node) => node.data.raw)) : null),
    [enabled, nodes],
  )
  return <ApiDesignContext.Provider value={value}>{children}</ApiDesignContext.Provider>
}
