import { Plus, Trash2 } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'

import {
  buildSchemaColumns,
  generateExample,
  parseFieldModel,
  type SchemaColumn,
} from '@canvas/contract'

import { validateSchemaRow } from '../../schema/jsonSchema'
import type { SchemaCardSource } from '../../schema/schemaCards'
import {
  dateTimeInputValue,
  emptyRow,
  rfc3339FromLocalDateTime,
  setAt,
  valueAt,
} from '../../schema/rowValues'

function parseRoot(source: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(source)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

function examplesFrom(source: string): unknown[] {
  const root = parseRoot(source)
  return root && Array.isArray(root.examples) ? root.examples.slice(0, 5) : []
}

function writeExamples(source: string, examples: unknown[]): string {
  const root = parseRoot(source)
  if (!root) return source
  if (examples.length > 0) root.examples = examples.slice(0, 5)
  else delete root.examples
  return JSON.stringify(root, null, 2)
}

function compact(value: unknown): string {
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`
  if (value && typeof value === 'object') return `{${Object.keys(value).length} field${Object.keys(value).length === 1 ? '' : 's'}}`
  if (value === null) return 'null'
  return value === undefined ? '' : String(value)
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"'
        index += 1
      } else if (character === '"') {
        quoted = false
      } else {
        cell += character
      }
    } else if (character === '"') {
      quoted = true
    } else if (character === ',') {
      row.push(cell)
      cell = ''
    } else if (character === '\n') {
      row.push(cell.replace(/\r$/, ''))
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += character
    }
  }
  row.push(cell.replace(/\r$/, ''))
  if (row.some((value) => value !== '')) rows.push(row)
  return rows
}

function csvValue(text: string, column: SchemaColumn): unknown {
  if (text === '') return undefined
  if (text === 'null' && column.nullable) return null
  if (column.kind === 'integer' || column.kind === 'number') {
    const number = Number(text)
    return Number.isFinite(number) ? number : text
  }
  if (column.kind === 'boolean') return text === 'true' ? true : text === 'false' ? false : text
  if (column.kind === 'array' || column.kind === 'object') {
    try { return JSON.parse(text) } catch { return text }
  }
  return text
}

export function RowsPanel({
  source,
  schemas,
  testRows,
  onChangeSource,
  onChangeTestRows,
}: {
  source: string
  schemas: SchemaCardSource[]
  testRows: unknown[]
  onChangeSource: (source: string) => void
  onChangeTestRows: (rows: unknown[]) => void
}) {
  const model = parseFieldModel(source)
  const columns = buildSchemaColumns(model)
  const examples = examplesFrom(source)
  const [showInvalidOnly, setShowInvalidOnly] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pasteError, setPasteError] = useState('')
  const schemaMap = useMemo(() => Object.fromEntries(schemas.flatMap((schema) => {
    try { return [[schema.name, JSON.parse(schema.source)]] } catch { return [] }
  })), [schemas])
  const parsedSource = parseRoot(source)

  const exampleValidations = useMemo(() => examples.map((row) => (
    validateSchemaRow(source, schemas, row, columns)
  )), [columns, examples, schemas, source])
  const testValidations = useMemo(() => testRows.map((row) => (
    validateSchemaRow(source, schemas, row, columns)
  )), [columns, schemas, source, testRows])

  function setExample(index: number, row: unknown) {
    onChangeSource(writeExamples(source, examples.map((current, at) => at === index ? row : current)))
  }

  function deleteExample(index: number) {
    onChangeSource(writeExamples(source, examples.filter((_, at) => at !== index)))
  }

  function addExample() {
    if (examples.length >= 5) return
    onChangeSource(writeExamples(source, [...examples, emptyRow(columns)]))
  }

  function generateExamples() {
    if (!parsedSource) return
    const full = generateExample(parsedSource, schemaMap)
    const required = generateExample(parsedSource, schemaMap, 0, false)
    onChangeSource(writeExamples(source, [...examples, full, required].slice(0, 5)))
  }

  function importRows() {
    setPasteError('')
    try {
      let rows: unknown[]
      const text = pasteText.trim()
      if (!text) return
      if (text.startsWith('[')) {
        const parsed: unknown = JSON.parse(text)
        if (!Array.isArray(parsed)) throw new Error('JSON test data must be an array.')
        rows = parsed
      } else {
        const table = parseCsv(text)
        const header = table.shift() ?? []
        rows = table.map((values) => {
          let row: unknown = {}
          for (const [index, name] of header.entries()) {
            const column = columns.find((candidate) => candidate.key === name || candidate.label === name)
            if (!column) continue
            row = setAt(row, column.path, csvValue(values[index] ?? '', column))
          }
          return row
        })
      }
      onChangeTestRows(rows.slice(0, 1000))
      setPasteOpen(false)
      setPasteText('')
    } catch (cause) {
      setPasteError(cause instanceof Error ? cause.message : 'Could not read rows.')
    }
  }

  const visibleExamples = examples.map((row, index) => ({ row, index, validation: exampleValidations[index]! }))
    .filter((entry) => !showInvalidOnly || !entry.validation.valid)
  const visibleTests = testRows.map((row, index) => ({ row, index, validation: testValidations[index]! }))
    .filter((entry) => !showInvalidOnly || !entry.validation.valid)
  const validExamples = exampleValidations.filter((entry) => entry.valid).length
  const validTests = testValidations.filter((entry) => entry.valid).length

  return (
    <div className="schema-rows-panel">
      <section className="schema-row-set">
        <header className="schema-row-set-head">
          <div>
            <h3>Examples</h3>
            <span>{validExamples} of {examples.length} rows valid</span>
          </div>
          <div className="schema-row-actions">
            <button type="button" className="button" onClick={addExample} disabled={examples.length >= 5}><Plus size={13} /> Add row</button>
            <button type="button" className="button" onClick={generateExamples} disabled={examples.length >= 5}>Generate</button>
          </div>
        </header>
        <RowsTable
          columns={columns}
          rows={visibleExamples}
          onSet={(index, column, value) => setExample(index, setAt(examples[index], column.path, value))}
          onDelete={deleteExample}
        />
      </section>

      <section className="schema-row-set">
        <header className="schema-row-set-head">
          <div>
            <h3>Test data</h3>
            <span>{validTests} of {testRows.length} rows valid</span>
          </div>
          <div className="schema-row-actions">
            <button type="button" className="button" onClick={() => setPasteOpen((open) => !open)}>Paste rows</button>
            <label className="schema-row-toggle">
              <input type="checkbox" checked={showInvalidOnly} onChange={(event) => setShowInvalidOnly(event.target.checked)} />
              Show invalid only
            </label>
            <button type="button" className="button" onClick={() => onChangeTestRows([])} disabled={testRows.length === 0}>Clear</button>
          </div>
        </header>
        {pasteOpen && (
          <div className="schema-row-paste">
            <textarea
              rows={5}
              value={pasteText}
              onChange={(event) => setPasteText(event.target.value)}
              placeholder="JSON array, or CSV with a header row of property names."
            />
            <div className="schema-row-paste-actions">
              <button type="button" className="button primary" onClick={importRows} disabled={!pasteText.trim()}>Import rows</button>
              <span>{testRows.length} of 1,000 rows</span>
            </div>
            {pasteError && <div className="alert" role="alert">{pasteError}</div>}
          </div>
        )}
        <RowsTable
          columns={columns}
          rows={visibleTests}
          onSet={(index, column, value) => onChangeTestRows(testRows.map((row, at) => at === index ? setAt(row, column.path, value) : row))}
        />
      </section>
    </div>
  )
}

function RowsTable({
  columns,
  rows,
  onSet,
  onDelete,
}: {
  columns: SchemaColumn[]
  rows: Array<{ row: unknown; index: number; validation: ReturnType<typeof validateSchemaRow> }>
  onSet: (index: number, column: SchemaColumn, value: unknown) => void
  onDelete?: (index: number) => void
}) {
  if (columns.length === 0) return <p className="schema-table-empty">The schema has no object properties.</p>
  return (
    <div className="schema-rows-scroll">
      <table className="schema-rows-table">
        <thead>
          <tr>
            <th className="schema-row-status">Row</th>
            {columns.map((column) => (
              <th key={column.key}>
                <span>{column.label}{column.required ? ' *' : ''}</span>
                <small>{column.kind}{column.format ? ` · ${column.format}` : ''}</small>
              </th>
            ))}
            {onDelete && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ row, index, validation }) => (
            <Fragment key={index}>
              <tr className={validation.valid ? 'valid' : 'invalid'}>
                <td className="schema-row-status" title={validation.valid ? 'Valid' : 'Invalid'}>{validation.valid ? '✓' : '✗'} {index + 1}</td>
                {columns.map((column) => (
                  <td key={column.key} className={validation.cells[column.key] ? 'invalid' : ''} title={validation.cells[column.key]?.join('\n')}>
                    <RowCell
                      column={column}
                      value={valueAt(row, column.path)}
                      onChange={(value) => onSet(index, column, value)}
                    />
                  </td>
                ))}
                {onDelete && (
                  <td>
                    <button type="button" className="icon-button" aria-label={`Delete row ${index + 1}`} onClick={() => onDelete(index)}><Trash2 size={12} /></button>
                  </td>
                )}
              </tr>
              {!validation.valid && validation.messages.length > 0 && (
                <tr className="schema-row-errors">
                  <td colSpan={columns.length + (onDelete ? 2 : 1)}>{validation.messages.join(' · ')}</td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RowCell({
  column,
  value,
  onChange,
}: {
  column: SchemaColumn
  value: unknown
  onChange: (value: unknown) => void
}) {
  const [custom, setCustom] = useState(false)
  const [jsonOpen, setJsonOpen] = useState(false)
  const [jsonDraft, setJsonDraft] = useState('')

  if (column.compact) {
    return (
      <div className="schema-compact-cell">
        <button type="button" className="schema-compact-value" onClick={() => {
          setJsonDraft(JSON.stringify(value ?? null, null, 2))
          setJsonOpen(true)
        }}>
          {compact(value) || 'Edit JSON'}
        </button>
        {jsonOpen && (
          <div className="schema-cell-popover">
            <textarea rows={5} value={jsonDraft} onChange={(event) => setJsonDraft(event.target.value)} />
            <div>
              <button type="button" className="button" onClick={() => setJsonOpen(false)}>Cancel</button>
              <button type="button" className="button primary" onClick={() => {
                try {
                  onChange(JSON.parse(jsonDraft))
                  setJsonOpen(false)
                } catch {
                  // Keep the editor open for invalid JSON.
                }
              }}>Apply</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  if (column.kind === 'enum' && !custom && (value === undefined || value === null || column.enumValues.includes(String(value)))) {
    return (
      <select aria-label={column.label} value={value === null ? '__null__' : value === undefined ? '' : String(value)} onChange={(event) => {
        if (event.target.value === '__other__') {
          setCustom(true)
          onChange(undefined)
        } else if (event.target.value === '__null__') onChange(null)
        else onChange(event.target.value === '' ? undefined : event.target.value)
      }}>
        <option value="">—</option>
        {column.enumValues.map((option) => <option key={option} value={option}>{option}</option>)}
        {column.nullable && <option value="__null__">null</option>}
        <option value="__other__">Other…</option>
      </select>
    )
  }

  if (column.kind === 'boolean') {
    return (
      <select aria-label={column.label} value={value === null ? '__null__' : value === undefined ? '' : String(value)} onChange={(event) => {
        if (event.target.value === '__null__') onChange(null)
        else onChange(event.target.value === '' ? undefined : event.target.value === 'true')
      }}>
        <option value="">—</option>
        <option value="true">true</option>
        <option value="false">false</option>
        {column.nullable && <option value="__null__">null</option>}
      </select>
    )
  }

  const isDateTime = column.format === 'date-time'
  const inputType = column.format === 'date' ? 'date' : isDateTime ? 'datetime-local' : column.kind === 'number' || column.kind === 'integer' ? 'number' : 'text'
  const displayValue = isDateTime
    ? dateTimeInputValue(value)
    : value === null || value === undefined ? '' : String(value)
  return (
    <div className="schema-cell-input">
      <input
        aria-label={column.label}
        type={inputType}
        step={isDateTime ? 1 : undefined}
        value={displayValue}
        onChange={(event) => {
          const text = event.target.value
          if (text === '') onChange(undefined)
          else if (isDateTime) onChange(rfc3339FromLocalDateTime(text))
          else if (column.kind === 'number' || column.kind === 'integer') {
            const number = Number(text)
            onChange(Number.isFinite(number) ? number : text)
          } else onChange(text)
        }}
      />
      {column.nullable && (
        <button
          type="button"
          className={`schema-null-toggle${value === null ? ' active' : ''}`}
          aria-label={`Set ${column.label} null`}
          title={value === null ? 'Clear null' : 'Set null'}
          onClick={() => onChange(value === null ? undefined : null)}
        >∅</button>
      )}
    </div>
  )
}
