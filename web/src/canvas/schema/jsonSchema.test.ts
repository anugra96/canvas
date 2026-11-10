import { describe, expect, it } from 'vitest'

import type { CanvasEdge, CanvasNode } from '@canvas/contract'

import { analyzeJsonSchema, validateSchemaContracts } from './jsonSchema'

const validSource = JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Order',
  type: 'object',
  properties: {
    id: { type: 'string' },
    total: { type: 'number' },
  },
  required: ['id'],
})

function entityNode(
  id: string,
  entityType: string,
  fields: Record<string, string | number>,
): CanvasNode {
  return {
    id,
    type: 'text',
    x: 0,
    y: 0,
    width: 360,
    height: 220,
    text: '',
    app: { entityType, fields },
  }
}

function edge(id: string, fromNode: string, toNode: string, relationType: string): CanvasEdge {
  return { id, fromNode, toNode, app: { relationType } }
}

function schemaFields(overrides: Record<string, string | number> = {}): Record<string, string | number> {
  return {
    name: 'Order contract',
    kind: 'api',
    version: '1.0.0',
    owner: 'Tower',
    status: 'active',
    reviewStatus: 'approved',
    reviewedVersion: '1.0.0',
    lastReviewed: '2025-12-01',
    reviewIntervalDays: 90,
    source: validSource,
    ...overrides,
  }
}

describe('analyzeJsonSchema', () => {
  it('parses a valid schema and renders its structure', () => {
    const analysis = analyzeJsonSchema(validSource)
    expect(analysis.valid).toBe(true)
    expect(analysis.diagnostics).toEqual([])
    expect(analysis.outline[0]?.type).toBe('object')
    expect(analysis.outline[0]?.children.map((child) => child.name)).toEqual(['id', 'total'])
    expect(analysis.outline[0]?.children[0]?.required).toBe(true)
  })

  it('reports malformed JSON and invalid schema metadata', () => {
    expect(analyzeJsonSchema('{"type":').diagnostics[0]?.message).toContain('Invalid JSON')
    const invalid = analyzeJsonSchema('{"type":42}')
    expect(invalid.valid).toBe(false)
    expect(invalid.diagnostics[0]?.severity).toBe('error')
  })

  it('warns when the dialect is omitted', () => {
    const analysis = analyzeJsonSchema('{"type":"object"}')
    expect(analysis.valid).toBe(true)
    expect(analysis.diagnostics[0]?.message).toContain('$schema')
  })
})

describe('validateSchemaContracts', () => {
  const now = new Date('2026-01-01T00:00:00Z')

  it('requires a contract for an active API System', () => {
    const api = entityNode('api', 'system', { name: 'Orders API', kind: 'api', status: 'active' })
    const issues = validateSchemaContracts([api], [], now)
    expect(issues.some((issue) => issue.code === 'schema_contract' && issue.nodeId === 'api')).toBe(true)
  })

  it('flags an invalid schema and a review that is overdue', () => {
    const invalid = entityNode('invalid', 'schema', schemaFields({ source: '{"type":' }))
    const overdue = entityNode('overdue', 'schema', schemaFields({
      name: 'Overdue',
      lastReviewed: '2020-01-01',
    }))
    const issues = validateSchemaContracts([invalid, overdue], [], now)
    expect(issues.some((issue) => issue.code === 'schema_invalid' && issue.severity === 'error')).toBe(true)
    expect(issues.some((issue) => issue.code === 'schema_review' && issue.nodeId === 'overdue')).toBe(true)
  })

  it('flags an active API System described by a draft schema', () => {
    const schema = entityNode('schema', 'schema', schemaFields({ status: 'draft' }))
    const api = entityNode('api', 'system', { name: 'Orders API', kind: 'api', status: 'active' })
    const issues = validateSchemaContracts([schema, api], [edge('describes', 'schema', 'api', 'describes')], now)
    expect(issues.some((issue) => issue.message.includes('draft schema'))).toBe(true)
  })
})

describe('schema links', () => {
  it('treats schema-to-schema uses as contract links', () => {
    const customer = entityNode('customer', 'schema', schemaFields({ name: 'Customer' }))
    const order = entityNode('order', 'schema', schemaFields({ name: 'Order' }))
    const issues = validateSchemaContracts(
      [customer, order],
      [edge('reference', 'order', 'customer', 'uses')],
      new Date('2026-01-01T00:00:00Z'),
    )
    expect(issues.some((issue) => issue.code === 'schema_unlinked')).toBe(false)
  })
})
