import { AlertCircle, AlertTriangle, CheckCircle2, ChevronRight, ListTree, Table2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

import type { EntityFields } from '@canvas/contract'

import {
  analyzeJsonSchema,
  schemaReviewReasons,
  type SchemaOutlineNode,
} from '../schema/jsonSchema'

function fieldValue(fields: EntityFields, key: string): string {
  const value = fields[key]
  return value == null ? '' : String(value)
}

interface SchemaTableRow {
  node: SchemaOutlineNode
  depth: number
}

function flattenOutline(nodes: SchemaOutlineNode[], depth = 0): SchemaTableRow[] {
  return nodes.flatMap((node) => [
    { node, depth },
    ...flattenOutline(node.children, depth + 1),
  ])
}

function SchemaTable({ outline }: { outline: SchemaOutlineNode[] }) {
  const root = outline[0]
  const rows = flattenOutline(root?.children ?? [])
  if (rows.length === 0) {
    return <p className="schema-table-empty">This schema has no object properties yet.</p>
  }
  return (
    <div className="schema-table-scroll">
      <table className="schema-table">
        <thead>
          <tr>
            <th>Field</th>
            <th>Type</th>
            <th>Required</th>
            <th>Constraints / description</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ node, depth }, index) => (
            <tr key={`${node.name}-${index}`}>
              <td>
                <span className="schema-table-field" style={{ paddingLeft: depth * 14 }}>
                  {node.name}
                </span>
              </td>
              <td><code>{node.type}</code></td>
              <td>{node.required ? <span className="schema-table-required">required</span> : '—'}</td>
              <td>{[node.constraints, node.description].filter(Boolean).join(' · ') || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function OutlineRow({ node, depth = 0 }: { node: SchemaOutlineNode; depth?: number }) {
  return (
    <div className="schema-outline-row" style={{ paddingLeft: depth * 13 }}>
      <ChevronRight size={11} />
      <span className={`schema-outline-name${node.required ? ' required' : ''}`}>{node.name}</span>
      <span className="schema-outline-type">{node.type}</span>
      {node.children.length > 0 && (
        <div className="schema-outline-children">
          {node.children.map((child, index) => (
            <OutlineRow key={`${child.name}-${index}`} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

export function SchemaEditor({
  fields,
  onChange,
  api = false,
}: {
  fields: EntityFields
  onChange: (key: string, value: string) => void
  api?: boolean
}) {
  const source = fieldValue(fields, 'source')
  const analysis = useMemo(
    () => analyzeJsonSchema(source, api ? { assumedDialect: '2020-12' } : {}),
    [api, source],
  )
  const sourceRef = useRef<HTMLTextAreaElement>(null)
  const [structureView, setStructureView] = useState<'table' | 'tree'>('table')
  const reviewApproved = fieldValue(fields, 'reviewStatus') === 'approved'
  const version = fieldValue(fields, 'version')
  const reviewedVersion = fieldValue(fields, 'reviewedVersion')
  const reviewReasons = schemaReviewReasons(fields, new Date())
  const reviewHealthy = reviewApproved && reviewReasons.length === 0

  function handleSourceKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Tab') return
    event.preventDefault()
    const target = event.currentTarget
    const start = target.selectionStart
    const end = target.selectionEnd
    const next = `${source.slice(0, start)}  ${source.slice(end)}`
    onChange('source', next)
    requestAnimationFrame(() => {
      sourceRef.current?.setSelectionRange(start + 2, start + 2)
    })
  }

  return (
    <div className="schema-workbench">
      <section className="schema-source-pane">
        <header className="schema-source-head">
          <div>
            <span className="schema-source-kicker">JSON Schema</span>
            <span className={`schema-state ${analysis.valid ? 'valid' : 'invalid'}`}>
              {analysis.valid ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
              {analysis.valid ? 'Valid' : 'Invalid'}
            </span>
          </div>
          <span className="schema-source-note">Source is the contract authority</span>
        </header>
        <textarea
          ref={sourceRef}
          className="schema-source-input"
          value={source}
          onChange={(event) => onChange('source', event.target.value)}
          onKeyDown={handleSourceKeyDown}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          placeholder="Paste a JSON Schema document."
        />
        <div className="schema-diagnostics">
          {analysis.diagnostics.length === 0 ? (
            <p className="schema-diagnostic valid"><CheckCircle2 size={13} /> No schema issues.</p>
          ) : analysis.diagnostics.map((diagnostic, index) => (
            <p key={`${diagnostic.message}-${index}`} className={`schema-diagnostic ${diagnostic.severity}`}>
              {diagnostic.severity === 'error' ? <AlertCircle size={13} /> : <AlertTriangle size={13} />}
              <span>{diagnostic.message}</span>
            </p>
          ))}
        </div>
        <div className="schema-structure">
          <div className="schema-structure-head">
            <h3>Structure</h3>
            <div className="schema-view-toggle" role="group" aria-label="Structure view">
              <button
                type="button"
                className={structureView === 'table' ? 'active' : ''}
                onClick={() => setStructureView('table')}
                aria-pressed={structureView === 'table'}
              >
                <Table2 size={11} />
                Table
              </button>
              <button
                type="button"
                className={structureView === 'tree' ? 'active' : ''}
                onClick={() => setStructureView('tree')}
                aria-pressed={structureView === 'tree'}
              >
                <ListTree size={11} />
                Tree
              </button>
            </div>
          </div>
          {structureView === 'table'
            ? <SchemaTable outline={analysis.outline} />
            : analysis.outline.map((node) => <OutlineRow key={node.name} node={node} />)}
        </div>
      </section>

      <aside className="schema-inspector">
        <section className="schema-inspector-section">
          <h3>Contract</h3>
          <div className="schema-field-grid">
            <label className="entity-field">
              <span>Name</span>
              <input value={fieldValue(fields, 'name')} onChange={(event) => onChange('name', event.target.value)} />
            </label>
            {!api && (
              <>
                <label className="entity-field">
                  <span>Version</span>
                  <input value={version} onChange={(event) => onChange('version', event.target.value)} placeholder="1.0.0" />
                </label>
                <label className="entity-field">
                  <span>Owner</span>
                  <input value={fieldValue(fields, 'owner')} onChange={(event) => onChange('owner', event.target.value)} />
                </label>
                <label className="entity-field">
                  <span>Kind</span>
                  <select value={fieldValue(fields, 'kind')} onChange={(event) => onChange('kind', event.target.value)}>
                    {['api', 'database', 'event', 'config', 'dataset', 'other'].map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
                <label className="entity-field">
                  <span>Status</span>
                  <select value={fieldValue(fields, 'status')} onChange={(event) => onChange('status', event.target.value)}>
                    {['draft', 'active', 'deprecated'].map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </div>
        </section>

        {!api && (
          <section className="schema-inspector-section">
            <h3>Review</h3>
            <div className={`schema-review-banner ${reviewHealthy ? 'approved' : 'pending'}`}>
              {reviewHealthy ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
              {reviewHealthy ? 'Reviewed for this version' : `Review required: ${reviewReasons.join(', ')}`}
            </div>
            <div className="schema-field-grid">
              <label className="entity-field">
                <span>Review status</span>
                <select value={fieldValue(fields, 'reviewStatus')} onChange={(event) => onChange('reviewStatus', event.target.value)}>
                  {['needs_review', 'changes_requested', 'approved'].map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="entity-field">
                <span>Reviewed version</span>
                <input value={reviewedVersion} onChange={(event) => onChange('reviewedVersion', event.target.value)} placeholder="1.0.0" />
              </label>
              <label className="entity-field">
                <span>Last reviewed</span>
                <input type="date" value={fieldValue(fields, 'lastReviewed')} onChange={(event) => onChange('lastReviewed', event.target.value)} />
              </label>
              <label className="entity-field">
                <span>Interval (days)</span>
                <input type="number" min={0} value={fieldValue(fields, 'reviewIntervalDays')} onChange={(event) => onChange('reviewIntervalDays', event.target.value)} />
              </label>
            </div>
          </section>
        )}
      </aside>
    </div>
  )
}
