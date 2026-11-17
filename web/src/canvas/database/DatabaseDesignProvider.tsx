import { useMemo, type ReactNode } from 'react'

import { getEntityMeta, type CanvasNode } from '@canvas/contract'

import { DatabaseDesignContext, type DatabaseDesign } from './DatabaseDesignContext'

function stringField(node: CanvasNode, key: string): string {
  const value = getEntityMeta(node)?.fields[key]
  return value == null ? '' : String(value)
}

export function DatabaseDesignProvider({
  nodes,
  enabled,
  children,
}: {
  nodes: CanvasNode[]
  enabled: boolean
  children: ReactNode
}) {
  const value = useMemo<DatabaseDesign | null>(() => {
    if (!enabled) return null
    const schemas = new Set<string>(['public'])
    const enums: DatabaseDesign['enums'] = []
    for (const node of nodes) {
      const entityType = getEntityMeta(node)?.entityType
      if (entityType === 'db_schema') schemas.add(stringField(node, 'name'))
      if (entityType === 'table' || entityType === 'db_enum') {
        schemas.add(stringField(node, 'schema') || 'public')
      }
      if (entityType === 'db_enum') {
        enums.push({
          schema: stringField(node, 'schema') || 'public',
          name: stringField(node, 'name'),
          values: stringField(node, 'values').split(/\r?\n/).map((value) => value.trim()).filter(Boolean),
        })
      }
    }
    return {
      schemas: [...schemas].filter(Boolean).sort((left, right) => left.localeCompare(right)),
      enums: enums.sort((left, right) =>
        `${left.schema}.${left.name}`.localeCompare(`${right.schema}.${right.name}`)),
    }
  }, [enabled, nodes])
  return <DatabaseDesignContext.Provider value={value}>{children}</DatabaseDesignContext.Provider>
}
