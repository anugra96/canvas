import type { CanvasProfileIssue } from '@canvas/contract'

export interface SemanticSuggestion {
  entityType: string
  relationType: string
  nameSuffix: string
  description: string
}

const SUGGESTIONS: Partial<Record<CanvasProfileIssue['code'], SemanticSuggestion>> = {
  artifact_without_producer: {
    entityType: 'system',
    relationType: 'produces',
    nameSuffix: 'producer',
    description: 'Add a System that produces this artifact.',
  },
  process_without_runner: {
    entityType: 'actor',
    relationType: 'runs',
    nameSuffix: 'runner',
    description: 'Add an Actor that runs this process.',
  },
}

export function semanticSuggestionForIssue(
  issue: CanvasProfileIssue,
): SemanticSuggestion | undefined {
  if (!issue.nodeId) return undefined
  return SUGGESTIONS[issue.code]
}
