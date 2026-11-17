import { createContext, useContext } from 'react'

export interface SchemaCardSource {
  id: string
  name: string
  source: string
}

export const SchemaCardsContext = createContext<SchemaCardSource[]>([])

export function useSchemaCards(): SchemaCardSource[] {
  return useContext(SchemaCardsContext)
}
