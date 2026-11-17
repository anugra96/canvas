import { useMemo, type ReactNode } from 'react'

import { getEntityMeta, type CanvasNode } from '@canvas/contract'

import { SchemaCardsContext } from './schemaCards'

export function SchemaCardsProvider({
  nodes,
  children,
}: {
  nodes: CanvasNode[]
  children: ReactNode
}) {
  const value = useMemo(() => nodes.flatMap((node) => {
    const meta = getEntityMeta(node)
    if (meta?.entityType !== 'schema') return []
    const name = String(meta.fields.name ?? '').trim()
    if (!name) return []
    return [{ name, source: String(meta.fields.source ?? '') }]
  }), [nodes])
  return <SchemaCardsContext.Provider value={value}>{children}</SchemaCardsContext.Provider>
}
