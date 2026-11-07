const SESSION_KEY = 'canvas-auth-session'

export interface CanvasSession {
  idToken: string
  subject: string
  displayName: string
  email: string
}

export const mockSession: CanvasSession = {
  idToken: 'local-dev',
  subject: 'cognito:local-dev',
  displayName: 'Local Dev',
  email: 'dev@localhost',
}

export function mockAuthEnabled(): boolean {
  return import.meta.env.MODE === 'test' || import.meta.env.VITE_CANVAS_USE_MOCKS !== 'false'
}

export async function signIn(email: string, password: string): Promise<CanvasSession> {
  const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID
  const clientId = import.meta.env.VITE_COGNITO_APP_CLIENT_ID
  if (!userPoolId || !clientId) {
    throw new Error('Cognito is not configured.')
  }

  const {
    AuthenticationDetails,
    CognitoUser,
    CognitoUserPool,
  } = await import('amazon-cognito-identity-js')

  const pool = new CognitoUserPool({ UserPoolId: userPoolId, ClientId: clientId })
  const normalizedEmail = email.trim().toLowerCase()
  const user = new CognitoUser({ Pool: pool, Username: normalizedEmail })
  const details = new AuthenticationDetails({
    Username: normalizedEmail,
    Password: password,
  })

  const cognitoSession = await new Promise<import('amazon-cognito-identity-js').CognitoUserSession>(
    (resolve, reject) => {
      user.authenticateUser(details, { onSuccess: resolve, onFailure: reject })
    },
  )

  const idToken = cognitoSession.getIdToken().getJwtToken()
  const claims = cognitoSession.getIdToken().decodePayload()
  const session: CanvasSession = {
    idToken,
    subject: `cognito:${String(claims.sub)}`,
    displayName: typeof claims.name === 'string' && claims.name
      ? claims.name
      : typeof claims.email === 'string' && claims.email
        ? claims.email
        : normalizedEmail,
    email: typeof claims.email === 'string' ? claims.email : normalizedEmail,
  }
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return session
}

export function readSession(): CanvasSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw) as CanvasSession
  } catch {
    sessionStorage.removeItem(SESSION_KEY)
    return null
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    return
  }
}
