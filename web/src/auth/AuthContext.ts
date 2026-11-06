import { createContext, useContext } from 'react'

import type { CanvasSession } from './auth'

export interface AuthContextValue {
  session: CanvasSession
  signOut: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthGate')
  return context
}
