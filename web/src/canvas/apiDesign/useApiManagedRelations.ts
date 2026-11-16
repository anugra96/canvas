import { useEffect, useMemo } from 'react'

import { deriveManagedRelations } from '@canvas/contract'

import { toFlowEdge, type CanvasFlowEdge, type CanvasFlowNode } from '../model/adapter'

export function useApiManagedRelations({
  nodes,
  setEdges,
  enabled,
}: {
  nodes: CanvasFlowNode[]
  setEdges: (update: (current: CanvasFlowEdge[]) => CanvasFlowEdge[]) => void
  enabled: boolean
}) {
  const managed = useMemo(
    () => (enabled
      ? deriveManagedRelations({ nodes: nodes.map((node) => node.data.raw), edges: [] })
      : null),
    [enabled, nodes],
  )

  useEffect(() => {
    if (!managed) return
    setEdges((current) => {
      const managedNow = current
        .filter((edge) => edge.data?.raw?.app?.managed === true)
        .map((edge) => edge.data?.raw)
      if (JSON.stringify(managedNow) === JSON.stringify(managed)) return current
      const manual = current.filter((edge) => edge.data?.raw?.app?.managed !== true)
      return [
        ...manual,
        ...managed.map((edge) => toFlowEdge(edge)),
      ]
    })
  }, [managed, setEdges])
}
