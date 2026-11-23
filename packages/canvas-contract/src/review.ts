import type { JsonCanvas } from './jsonCanvas'
import {
  PROFILE_ISSUE_CODES,
  type CanvasProfileIssue,
  type ProfileIssueCode,
} from './profile'

export const REVIEW_MODES = ['sketch', 'design', 'publish'] as const

export type ReviewMode = (typeof REVIEW_MODES)[number]

export const DEFAULT_REVIEW_MODE: ReviewMode = 'design'

export type IssueTier = 'integrity' | 'design' | 'publish'

export const ISSUE_TIERS: Record<ProfileIssueCode, IssueTier> = {
  untyped_text: 'design',
  unknown_entity_type: 'integrity',
  missing_required_field: 'publish',
  missing_relation_type: 'design',
  unknown_relation_type: 'design',
  relation_not_allowed: 'design',
  group_endpoint: 'integrity',
  missing_endpoint: 'integrity',
  schema_invalid: 'integrity',
  schema_review: 'publish',
  schema_unlinked: 'design',
  schema_ref_missing: 'integrity',
  schema_contract: 'design',
  artifact_without_producer: 'design',
  example_invalid: 'integrity',
  operation_invalid: 'integrity',
  ref_unresolved: 'integrity',
  operation_duplicate: 'integrity',
  path_parameter_mismatch: 'integrity',
  response_success_missing: 'design',
  mutation_errors_missing: 'design',
  security_missing: 'design',
  list_pagination_missing: 'publish',
  get_with_body: 'design',
  naming_inconsistent: 'publish',
  schema_unused: 'publish',
  endpoint_without_resource: 'design',
  level_unassigned: 'design',
  unzoned_card: 'publish',
  district_without_owner: 'publish',
  shared_landmark: 'design',
  route_bypasses_gate: 'design',
}

export const MODE_TIERS: Record<ReviewMode, ReadonlySet<IssueTier>> = {
  sketch: new Set(['integrity']),
  design: new Set(['integrity', 'design']),
  publish: new Set(['integrity', 'design', 'publish']),
}

export const REVIEW_MODE_LABELS: Record<ReviewMode, string> = {
  sketch: 'Sketch',
  design: 'Design',
  publish: 'Publish',
}

export function issueVisibleInMode(
  issue: Pick<CanvasProfileIssue, 'code'>,
  mode: ReviewMode,
): boolean {
  return MODE_TIERS[mode].has(ISSUE_TIERS[issue.code])
}

export function visibleIssueCodes(mode: ReviewMode): ProfileIssueCode[] {
  return PROFILE_ISSUE_CODES.filter((code) => MODE_TIERS[mode].has(ISSUE_TIERS[code]))
}

export function canvasReviewMode(canvas: Pick<JsonCanvas, 'app'>): ReviewMode {
  if (!canvas.app?.profile) return DEFAULT_REVIEW_MODE
  const mode = canvas.app.reviewMode
  return mode === 'sketch' || mode === 'publish' || mode === 'design'
    ? mode
    : DEFAULT_REVIEW_MODE
}

export function withCanvasReviewMode(canvas: JsonCanvas, mode: ReviewMode): JsonCanvas {
  if (!canvas.app?.profile) return canvas
  const app = { ...canvas.app }
  if (mode === 'design') delete app.reviewMode
  else app.reviewMode = mode
  return {
    ...canvas,
    app: Object.keys(app).length > 0 ? app : undefined,
  } as JsonCanvas
}
