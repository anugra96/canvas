import { createContext, useContext } from 'react'

export interface DatabaseEnumOption {
  schema: string
  name: string
  values: string[]
}

export interface DatabaseDesign {
  enums: DatabaseEnumOption[]
  schemas: string[]
}

export const DatabaseDesignContext = createContext<DatabaseDesign | null>(null)

export function useDatabaseDesign(): DatabaseDesign {
  return useContext(DatabaseDesignContext) ?? { enums: [], schemas: [] }
}
