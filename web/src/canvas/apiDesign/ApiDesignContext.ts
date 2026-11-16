import { createContext, useContext } from 'react'

import type { ApiReferenceDocument } from '@canvas/contract'

export const ApiDesignContext = createContext<ApiReferenceDocument | null>(null)

export function useApiDesign(): ApiReferenceDocument | null {
  return useContext(ApiDesignContext)
}
