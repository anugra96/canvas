import { describe, expect, it } from 'vitest'

import type { CanvasProfileIssue, JsonCanvas } from '@canvas/contract'

import {
  createSuppression,
  readValidationSuppressions,
  withValidationSuppressions,
} from './validationSuppressions'

const issue: CanvasProfileIssue = {
  code: 'missing_relation_type',
  severity: 'warning',
  message: 'Edge "edge" has no relation type.',
  edgeId: 'edge',
}

describe('validation suppressions', () => {
  it('round-trips ignored warnings through canvas metadata', () => {
    const suppression = createSuppression(issue, 'Accepted legacy item', '2026-11-09T00:00:00.000Z')
    const canvas = withValidationSuppressions({ nodes: [], edges: [] } as JsonCanvas, [suppression])

    expect(readValidationSuppressions(canvas)).toEqual([suppression])
    expect(readValidationSuppressions({ nodes: [], edges: [] })).toEqual([])
  })

  it('removes the metadata key when no suppressions remain', () => {
    const suppression = createSuppression(issue, 'Deferred review', '2026-11-09T00:00:00.000Z')
    const canvas = withValidationSuppressions({ nodes: [], edges: [] }, [suppression])
    const restored = withValidationSuppressions(canvas, [])

    expect(readValidationSuppressions(restored)).toEqual([])
    expect(restored.app).toBeUndefined()
  })
})
