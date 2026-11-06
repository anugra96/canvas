import { type FormEvent, type ReactNode, useState } from 'react'

import { AuthContext } from './AuthContext'
import {
  clearSession,
  mockAuthEnabled,
  mockSession,
  readSession,
  signIn,
  type CanvasSession,
} from './auth'

export function AuthGate({ children }: { children: ReactNode }) {
  const mock = mockAuthEnabled()
  const [session, setSession] = useState<CanvasSession | null>(() => mock ? mockSession : readSession())
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      setSession(await signIn(email, password))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Skyward Canvas could not sign in.')
    } finally {
      setBusy(false)
    }
  }

  if (!session) {
    return (
      <main className="login-shell">
        <form className="login-card" onSubmit={submit}>
          <div className="login-brand">
            <span className="brand-mark">SC</span>
            <div>
              <strong>Skyward Canvas</strong>
              <p>Sign in with your individual Skyward account.</p>
            </div>
          </div>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {error && <div className="alert" role="alert">{error}</div>}
          <button className="button primary" disabled={busy}>
            {busy ? 'Signing in' : 'Sign in'}
          </button>
        </form>
      </main>
    )
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        signOut: () => {
          clearSession()
          setSession(mock ? mockSession : null)
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
