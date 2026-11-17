import { describe, expect, it } from 'vitest'

import type { CanvasProfileIssue } from '@canvas/contract'

import { toFlowEdge, toFlowNode } from '../model/adapter'
import { buildSuggestions } from './suggestionEngine'

function node(id: string, entityType: string, x = 0, y = 0) {
  return toFlowNode({
    id,
    type: 'text',
    x,
    y,
    width: 200,
    height: 100,
    text: id,
    app: { entityType, fields: { name: id } },
  })
}

function issue(code: CanvasProfileIssue['code'], nodeId: string): CanvasProfileIssue {
  return { code, severity: 'warning', message: code, nodeId }
}

describe('suggestion engine', () => {
  it('groups missing artifact producers into one suggestion', () => {
    const suggestions = buildSuggestions(
      [
        issue('artifact_without_producer', 'one'),
        issue('artifact_without_producer', 'two'),
      ],
      [node('one', 'artifact'), node('two', 'artifact', 400, 0)],
      [],
    )

    expect(suggestions).toEqual([
      expect.objectContaining({
        title: 'Add missing artifact producers',
        count: 2,
        items: [
          expect.objectContaining({ title: 'one' }),
          expect.objectContaining({ title: 'two' }),
        ],
      }),
    ])
  })

  it('suggests an actor for a process without a runner', () => {
    const suggestions = buildSuggestions(
      [issue('process_without_runner', 'process')],
      [node('process', 'process')],
      [],
    )

    const action = suggestions[0]?.items[0]?.action
    if (action?.kind !== 'add-cards') throw new Error('Expected an add-cards action')
    expect(action.fixes[0]).toEqual({
      targetId: 'process',
      entityType: 'actor',
      relationType: 'runs',
      nameSuffix: 'runner',
    })
  })

  it('does not add a producer when an unrelated incoming edge can be repaired', () => {
    const incoming = toFlowEdge({ id: 'edge', fromNode: 'system', toNode: 'artifact' })
    const suggestions = buildSuggestions(
      [issue('artifact_without_producer', 'artifact')],
      [node('system', 'system'), node('artifact', 'artifact', 400, 0)],
      [incoming],
    )

    expect(suggestions).toEqual([])
  })
})
