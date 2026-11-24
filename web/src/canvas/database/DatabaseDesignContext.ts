import { createContext, useContext } from 'react'

import type { DatabaseTarget } from '@canvas/contract'

export interface DatabaseEnumOption {
  schema: string
  name: string
  values: string[]
}

export interface DatabaseTableOption {
  schema: string
  name: string
  columns: string[]
  primaryKey: string[]
}

export interface DatabaseDesign {
  target?: DatabaseTarget
  enums: DatabaseEnumOption[]
  schemas: string[]
  tables: DatabaseTableOption[]
}

export const DatabaseDesignContext = createContext<DatabaseDesign | null>(null)

export function useDatabaseDesign(): DatabaseDesign {
  return useContext(DatabaseDesignContext) ?? { enums: [], schemas: [], tables: [] }
}
