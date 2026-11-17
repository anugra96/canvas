import type { CanvasProfileIssue, ReviewMode } from '@canvas/contract'

import { validationIssueKey } from './validationIdentity'
import type { ValidationSuppression } from './validationSuppressions'

export function blockedExportIssues(
  mode: ReviewMode,
  issues: CanvasProfileIssue[],
  suppressions: ValidationSuppression[],
): CanvasProfileIssue[] {
  if (mode !== 'publish') return []
  const ignored = new Set(suppressions.map((suppression) => suppression.fingerprint))
  return issues.filter((issue) => !ignored.has(validationIssueKey(issue)))
}

export function exportBlocked(
  mode: ReviewMode,
  issues: CanvasProfileIssue[],
  suppressions: ValidationSuppression[],
): boolean {
  return blockedExportIssues(mode, issues, suppressions).length > 0
}
