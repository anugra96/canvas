import type { CanvasProfileIssue, JsonCanvas } from '@canvas/contract'

import { validationIssueKey, validationTargetId } from './validationIdentity'

const VALIDATION_SUPPRESSIONS_KEY = 'validationSuppressions'

export const IGNORE_REASONS = [
  'Accepted legacy item',
  'False positive',
  'Deferred review',
] as const

export type IgnoreReason = (typeof IGNORE_REASONS)[number]

export interface ValidationSuppression {
  fingerprint: string
  code: CanvasProfileIssue['code']
  targetId: string
  reason: IgnoreReason
  createdAt: string
}

function isSuppression(value: unknown): value is ValidationSuppression {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record.fingerprint === 'string'
    && typeof record.code === 'string'
    && typeof record.targetId === 'string'
    && typeof record.reason === 'string'
    && typeof record.createdAt === 'string'
}

export function readValidationSuppressions(canvas: JsonCanvas): ValidationSuppression[] {
  const app = canvas.app as unknown as Record<string, unknown> | undefined
  const raw = app?.[VALIDATION_SUPPRESSIONS_KEY]
  if (!Array.isArray(raw)) return []
  return raw.filter(isSuppression)
}

export function withValidationSuppressions(
  canvas: JsonCanvas,
  suppressions: ValidationSuppression[],
): JsonCanvas {
  const app = { ...(canvas.app as unknown as Record<string, unknown> | undefined) }
  if (suppressions.length === 0) {
    delete app[VALIDATION_SUPPRESSIONS_KEY]
  } else {
    app[VALIDATION_SUPPRESSIONS_KEY] = suppressions
  }
  return {
    ...canvas,
    app: Object.keys(app).length > 0 ? app : undefined,
  } as JsonCanvas
}

export function createSuppression(
  issue: CanvasProfileIssue,
  reason: IgnoreReason,
  createdAt = new Date().toISOString(),
): ValidationSuppression {
  return {
    fingerprint: validationIssueKey(issue),
    code: issue.code,
    targetId: validationTargetId(issue),
    reason,
    createdAt,
  }
}
