import { describe, expect, it } from 'vitest'

import type { CanvasProfileIssue } from '@canvas/contract'

import { blockedExportIssues } from './reviewExport'
import { createSuppression } from './validationSuppressions'

const issue: CanvasProfileIssue = {
  code: 'schema_unlinked',
  severity: 'warning',
  message: 'Schema "Model" is not linked to an architecture card.',
  nodeId: 'Model',
}

describe('publish export gate', () => {
  it('Publish blocks export until the issue is ignored with a reason', () => {
    expect(blockedExportIssues('publish', [issue], [])).toEqual([issue])
    expect(blockedExportIssues('design', [issue], [])).toEqual([])

    const suppression = createSuppression(issue, 'False positive', '2026-11-16T10:00:00Z')
    expect(suppression.reason).toBe('False positive')
    expect(blockedExportIssues('publish', [issue], [suppression])).toEqual([])
  })
})
