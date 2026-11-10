import type { CanvasProfileIssue } from '@canvas/contract'

export function validationTargetId(issue: CanvasProfileIssue): string {
  return issue.nodeId ?? issue.edgeId ?? 'canvas'
}

export function validationIssueKey(issue: CanvasProfileIssue): string {
  return `${issue.code}:${validationTargetId(issue)}:${issue.fieldKey ?? ''}`
}
