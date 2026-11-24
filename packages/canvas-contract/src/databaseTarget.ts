import type { JsonCanvas } from './jsonCanvas'

export const DATABASE_TARGETS = ['postgres', 'sqlite', 'dynamodb'] as const

export type DatabaseTarget = (typeof DATABASE_TARGETS)[number]

export function isDatabaseTarget(value: unknown): value is DatabaseTarget {
  return DATABASE_TARGETS.includes(value as DatabaseTarget)
}

export function canvasDatabaseTarget(
  canvas: Partial<Pick<JsonCanvas, 'app'>>,
): DatabaseTarget | undefined {
  const target = canvas.app?.target
  return isDatabaseTarget(target) ? target : undefined
}

export function withCanvasDatabaseTarget(
  canvas: JsonCanvas,
  target: DatabaseTarget | undefined,
): JsonCanvas {
  if (!canvas.app?.profile) return canvas
  const app = { ...canvas.app }
  if (target === undefined) delete app.target
  else app.target = target
  return { ...canvas, app }
}
