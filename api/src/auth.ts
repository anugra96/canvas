import { HTTPException } from 'hono/http-exception'
import type { Context } from 'hono'

export type AuthMode = 'local' | 'cognito'

export interface CanvasPrincipal {
  subject: string
  displayName: string
  email: string
  groups: string[]
  tenantId: string
}

export const CANVAS_EDITOR_GROUP = 'skyward-canvas-editors'

export const LOCAL_DEV_TOKEN = 'local-dev'

export function localPrincipal(): CanvasPrincipal {
  return {
    subject: 'cognito:local-dev',
    displayName: 'Local Dev',
    email: 'dev@skywardwildfire.com',
    groups: [CANVAS_EDITOR_GROUP],
    tenantId: 'skyward',
  }
}

export function principalFromClaims(claims: Record<string, unknown>): CanvasPrincipal | null {
  const subject = typeof claims.sub === 'string' ? claims.sub : ''
  if (!subject) return null
  const groupsValue = claims['cognito:groups']
  const groups = Array.isArray(groupsValue)
    ? groupsValue.filter((value): value is string => typeof value === 'string')
    : []
  return {
    subject: `cognito:${subject}`,
    displayName: typeof claims.name === 'string' && claims.name
      ? claims.name
      : typeof claims.email === 'string' && claims.email
        ? claims.email
        : subject,
    email: typeof claims.email === 'string' ? claims.email : '',
    groups,
    tenantId: 'skyward',
  }
}

export function authenticate(authorization: string | undefined, mode: AuthMode): CanvasPrincipal | null {
  if (mode === 'local') {
    return authorization === `Bearer ${LOCAL_DEV_TOKEN}` ? localPrincipal() : null
  }
  return null
}

export function requireCanvasPrincipal(c: Context, mode: AuthMode): CanvasPrincipal {
  const principal = authenticate(c.req.header('authorization'), mode)
  if (!principal) {
    throw new HTTPException(401, { message: 'Unauthorized' })
  }
  if (!principal.groups.includes(CANVAS_EDITOR_GROUP)) {
    throw new HTTPException(403, { message: 'Canvas access is not assigned to this account.' })
  }
  return principal
}
