import { describe, expect, it } from 'vitest'

import type { JsonCanvas } from './jsonCanvas'
import { canvasDatabaseTarget, withCanvasDatabaseTarget } from './databaseTarget'

function canvas(app?: JsonCanvas['app']): JsonCanvas {
  return { nodes: [], edges: [], ...(app ? { app } : {}) }
}

describe('canvas database target', () => {
  it('reads only stored target values', () => {
    expect(canvasDatabaseTarget(canvas())).toBeUndefined()
    expect(canvasDatabaseTarget(canvas({ profile: 'database', profileVersion: 2, target: 'postgres' })))
      .toBe('postgres')
    expect(canvasDatabaseTarget({
      app: { profile: 'database', profileVersion: 2, target: 'oracle' } as unknown as JsonCanvas['app'],
    })).toBeUndefined()
  })

  it('writes and deletes app.target without touching other app keys', () => {
    const base = canvas({ profile: 'database', profileVersion: 2, scope: 'container' })
    const withTarget = withCanvasDatabaseTarget(base, 'sqlite')

    expect(withTarget.app).toEqual({
      profile: 'database',
      profileVersion: 2,
      scope: 'container',
      target: 'sqlite',
    })
    expect(withCanvasDatabaseTarget(withTarget, undefined).app).toEqual(base.app)
  })

  it('leaves a canvas without a profile unchanged', () => {
    const empty = canvas()
    expect(withCanvasDatabaseTarget(empty, 'postgres')).toBe(empty)
  })
})
