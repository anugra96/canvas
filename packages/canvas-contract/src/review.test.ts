import { describe, expect, it } from 'vitest'

import {
  ISSUE_TIERS,
  PROFILE_ISSUE_CODES,
  visibleIssueCodes,
  type IssueTier,
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
})
