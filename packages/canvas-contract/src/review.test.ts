import { describe, expect, it } from 'vitest'

import {
  ISSUE_TIERS,
  PROFILE_ISSUE_CODES,
  canvasReviewMode,
  visibleIssueCodes,
  withCanvasReviewMode,
  type IssueTier,
  type JsonCanvas,
  type ProfileIssueCode,
  type ReviewMode,
} from './index'

const TIER_CODES: Record<IssueTier, ProfileIssueCode[]> = {
  integrity: [
    'unknown_entity_type',
    'group_endpoint',
    'missing_endpoint',
    'schema_invalid',
    'schema_ref_missing',
    'example_invalid',
    'operation_invalid',
    'ref_unresolved',
    'operation_duplicate',
    'path_parameter_mismatch',
  ],
  design: [
    'missing_relation_type',
    'unknown_relation_type',
    'relation_not_allowed',
    'untyped_text',
    'artifact_without_producer',
    'process_without_runner',
    'schema_unlinked',
    'schema_contract',
    'level_unassigned',
    'response_success_missing',
    'mutation_errors_missing',
    'security_missing',
    'get_with_body',
    'endpoint_without_resource',
  ],
  publish: [
    'missing_required_field',
    'schema_review',
    'list_pagination_missing',
    'naming_inconsistent',
    'schema_unused',
  ],
}

const MODE_EXPECTED: Array<{ mode: ReviewMode; tiers: IssueTier[] }> = [
  { mode: 'sketch', tiers: ['integrity'] },
  { mode: 'design', tiers: ['integrity', 'design'] },
  { mode: 'publish', tiers: ['integrity', 'design', 'publish'] },
]

const REVIEW_WRITE_EXPECTED: Array<{
  name: string
  canvas: JsonCanvas
  mode: ReviewMode
  app: JsonCanvas['app']
}> = [
  {
    name: 'raw canvas leaves design implicit',
    canvas: { nodes: [] },
    mode: 'design',
    app: undefined,
  },
  {
    name: 'raw canvas never stores publish',
    canvas: { nodes: [] },
    mode: 'publish',
    app: undefined,
  },
  {
    name: 'profiled canvas leaves design implicit',
    canvas: { nodes: [], app: { profile: 'systems', profileVersion: 4 } },
    mode: 'design',
    app: { profile: 'systems', profileVersion: 4 },
  },
  {
    name: 'profiled canvas stores sketch',
    canvas: { nodes: [], app: { profile: 'systems', profileVersion: 4 } },
    mode: 'sketch',
    app: { profile: 'systems', profileVersion: 4, reviewMode: 'sketch' },
  },
]

const REVIEW_READ_EXPECTED: Array<{ name: string; canvas: JsonCanvas; mode: ReviewMode }> = [
  {
    name: 'raw canvas ignores a stored mode',
    canvas: { nodes: [], app: { reviewMode: 'publish' } } as unknown as JsonCanvas,
    mode: 'design',
  },
  {
    name: 'profiled canvas reads its stored mode',
    canvas: { nodes: [], app: { profile: 'systems', profileVersion: 4, reviewMode: 'sketch' } },
    mode: 'sketch',
  },
]

describe('review modes', () => {
  it('gives every profile issue code a tier', () => {
    for (const code of PROFILE_ISSUE_CODES) {
      expect(ISSUE_TIERS[code]).toMatch(/^(integrity|design|publish)$/)
    }
  })

  it.each(MODE_EXPECTED)('$mode shows only its tiers', ({ mode, tiers }) => {
    const expected = tiers.flatMap((tier) => TIER_CODES[tier]).sort()
    expect(visibleIssueCodes(mode).sort()).toEqual(expected)
  })

  it.each(REVIEW_READ_EXPECTED)('$name', ({ canvas, mode }) => {
    expect(canvasReviewMode(canvas)).toBe(mode)
  })

  it.each(REVIEW_WRITE_EXPECTED)('$name', ({ canvas, mode, app }) => {
    expect(withCanvasReviewMode(canvas, mode).app).toEqual(app)
  })
})
