import { describe, expect, it } from 'vitest'

import type { CanvasProfileIssue } from '@canvas/contract'

import { semanticSuggestionForIssue } from './semanticSuggestion'

function issue(code: CanvasProfileIssue['code'], nodeId?: string): CanvasProfileIssue {
  return { code, severity: 'warning', message: code, nodeId }
}

describe('semantic suggestions', () => {
  it('maps the two MVP semantic warnings to deterministic repairs', () => {
    expect(semanticSuggestionForIssue(issue('artifact_without_producer', 'artifact'))).toEqual({
      entityType: 'system',
      relationType: 'produces',
      nameSuffix: 'producer',
      description: 'Add a System that produces this artifact.',
    })
  })

  it('does not suggest card creation for other warnings', () => {
    expect(semanticSuggestionForIssue(issue('missing_relation_type'))).toBeUndefined()
    expect(semanticSuggestionForIssue(issue('artifact_without_producer'))).toBeUndefined()
  })
})
