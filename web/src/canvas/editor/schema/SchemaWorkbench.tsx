import { AlertCircle, AlertTriangle, CheckCircle2, ChevronRight, ListTree, Table2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

import { parseFieldModel } from '@canvas/contract'

import type { SchemaCardSource } from '../../schema/schemaCards'
import {
  analyzeJsonSchema,
  type SchemaOutlineNode,
} from '../../schema/jsonSchema'
import { FieldsPanel } from './FieldsPanel'
import { RowsPanel } from './RowsPanel'

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

export function SchemaWorkbench({
  source,
  schemas,
  currentSchemaName,
  onChange,
  api = false,
  className,
}: {
  source: string
  schemas: SchemaCardSource[]
  currentSchemaName: string
  onChange: (source: string) => void
  api?: boolean
  className?: string
}) {
  const analysis = useMemo(
    () => analyzeJsonSchema(source, api ? { assumedDialect: '2020-12' } : {}),
    [api, source],
  )
  const sourceRef = useRef<HTMLTextAreaElement>(null)
  const [tab, setTab] = useState<'fields' | 'rows' | 'json'>(() => (
    parseFieldModel(source).valid ? 'fields' : 'json'
  ))
  const [structureView, setStructureView] = useState<'table' | 'tree'>('table')
  const [testRows, setTestRows] = useState<unknown[]>([])
  const fieldModel = useMemo(() => parseFieldModel(source), [source])

  function handleSourceKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Tab') return
    event.preventDefault()
    const target = event.currentTarget
    const start = target.selectionStart
    const end = target.selectionEnd
    const next = `${source.slice(0, start)}  ${source.slice(end)}`
    onChange(next)
    requestAnimationFrame(() => {
      sourceRef.current?.setSelectionRange(start + 2, start + 2)
    })
  }

  return (
    <section className={`schema-source-pane${className ? ` ${className}` : ''}`}>
      <div className="schema-workbench-tabs" role="tablist" aria-label="Schema workbench">
        <button type="button" role="tab" aria-selected={tab === 'fields'} className={tab === 'fields' ? 'active' : ''} onClick={() => setTab('fields')}>Fields</button>
        <button type="button" role="tab" aria-selected={tab === 'rows'} className={tab === 'rows' ? 'active' : ''} onClick={() => setTab('rows')}>Rows</button>
        <button type="button" role="tab" aria-selected={tab === 'json'} className={tab === 'json' ? 'active' : ''} onClick={() => setTab('json')}>JSON</button>
      </div>
      {tab === 'json' ? (
        <>
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
            onChange={(event) => onChange(event.target.value)}
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
        </>
      ) : !fieldModel.valid ? (
        <div className="schema-fix-json">
          <AlertCircle size={16} />
          <strong>Fix the JSON first</strong>
          <p>{fieldModel.error}</p>
          <button type="button" className="button" onClick={() => setTab('json')}>Open JSON tab</button>
        </div>
      ) : tab === 'fields' ? (
        <FieldsPanel
          source={source}
          schemas={schemas}
          currentSchemaName={currentSchemaName}
          onChange={onChange}
        />
      ) : (
        <RowsPanel
          source={source}
          schemas={schemas}
          testRows={testRows}
          onChangeTestRows={setTestRows}
          onChangeSource={onChange}
        />
      )}
    </section>
  )
}
