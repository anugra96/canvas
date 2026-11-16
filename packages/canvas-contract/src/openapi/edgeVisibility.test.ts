import { describe, expect, it } from 'vitest'

import { shouldDrawApiEdge } from './edgeVisibility'

describe('API edge visibility', () => {
  it.each([
    { name: 'hides contains', input: { relationType: 'contains' }, drawn: false },
    { name: 'hides API authentication', input: { relationType: 'authenticates_via', sourceType: 'api_definition' }, drawn: false },
    { name: 'hides inherited endpoint authentication', input: { relationType: 'authenticates_via', sourceType: 'endpoint', securityOverride: false }, drawn: false },
    { name: 'draws endpoint authentication overrides', input: { relationType: 'authenticates_via', sourceType: 'endpoint', securityOverride: true }, drawn: true },
    { name: 'draws 1xx returns', input: { relationType: 'returns', status: '101' }, drawn: true },
    { name: 'draws 2xx returns', input: { relationType: 'returns', status: '200' }, drawn: true },
    { name: 'draws 3xx returns', input: { relationType: 'returns', status: '3XX' }, drawn: true },
    { name: 'hides 4xx returns', input: { relationType: 'returns', status: '404' }, drawn: false },
    { name: 'hides 5xx returns', input: { relationType: 'returns', status: '503' }, drawn: false },
    { name: 'draws accepts', input: { relationType: 'accepts' }, drawn: true },
    { name: 'draws schema uses', input: { relationType: 'uses' }, drawn: true },
    { name: 'draws manual annotations', input: { relationType: 'relates_to' }, drawn: true },
  ])('$name', ({ input, drawn }) => {
    expect(shouldDrawApiEdge(input)).toBe(drawn)
  })
})
