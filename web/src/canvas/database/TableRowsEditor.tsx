import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'

import {
  classifyColumnType,
  generateTableRow,
  parseTableSamplesValue,
  validateTableRows,
  type ColumnTypeClassification,
  type TableColumn,
  type TableDefinition,
  type TableRow,
  type TableRowValidation,
  type TableRowValidationContext,
} from '@canvas/contract'

import { RowGrid, type RowGridCell, type RowGridColumn, type RowGridRow } from '../rows/RowGrid'
import { parseCsv } from '../rows/parseCsv'
import { dateTimeInputValue, rfc3339FromLocalDateTime } from '../schema/rowValues'
import { useDatabaseDesign } from './DatabaseDesignContext'

const SAMPLE_LIMIT = 20
const TEST_LIMIT = 1000

interface ColumnConfig {
  classification: ColumnTypeClassification
  enumValues: string[]
}

function parsePastedRows(text: string, columns: TableColumn[]): {
  rows: TableRow[]
  ignored: string[]
} {
  const known = new Set(columns.map((column) => column.name))
  if (text.startsWith('[')) {
    const parsed: unknown = JSON.parse(text)
    if (!Array.isArray(parsed)) throw new Error('JSON test data must be an array.')
    const ignored = new Set<string>()
    const rows = parsed.map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new Error('Each test row must be an object.')
      }
      const row: TableRow = {}
      for (const [key, value] of Object.entries(item)) {
        if (!known.has(key)) {
          ignored.add(key)
          continue
        }
        row[key] = value === null ? null : String(value)
      }
      return row
    })
    return { rows, ignored: [...ignored] }
  }

  const table = parseCsv(text)
  const header = (table.shift() ?? []).map((name) => name.trim())
  const indexes = header.flatMap((name, index) => (
    known.has(name) ? [[index, name] as const] : []
  ))
  const ignored = [...new Set(header.filter((name) => name && !known.has(name)))]
  const rows = table.map((values) => Object.fromEntries(indexes.map(([index, name]) => {
    const value = values[index] ?? ''
    return [name, value === '' ? null : value]
  })))
  return { rows, ignored }
}

export function TableRowsEditor({
  definition,
  samplesSource,
  testRows,
  onChangeSamples,
  onChangeTestRows,
}: {
  definition: TableDefinition
  samplesSource: unknown
  testRows: TableRow[]
  onChangeSamples: (rows: TableRow[]) => void
  onChangeTestRows: (rows: TableRow[]) => void
}) {
  const design = useDatabaseDesign()
  const parsedSamples = useMemo(() => parseTableSamplesValue(samplesSource), [samplesSource])
  const samples = parsedSamples.rows
  const [showInvalidOnly, setShowInvalidOnly] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pasteError, setPasteError] = useState('')
  const [ignoredColumns, setIgnoredColumns] = useState<string[]>([])

  const enumNames = useMemo(() => design.enums.map((item) => (
    item.schema === 'public' ? item.name : `${item.schema}.${item.name}`
  )), [design.enums])
  const enumValues = useMemo(() => new Map(design.enums.map((item, index) => [
    enumNames[index]!,
    item.values,
  ])), [design.enums, enumNames])
  const context = useMemo<TableRowValidationContext>(() => ({
    enumValues,
    parentRows: (schema, table) => {
      const parent = design.tables.find((candidate) => (
        candidate.schema === schema && candidate.name === table
      ))
      return parent?.samples && parent.samples.length > 0 ? parent.samples : undefined
    },
  }), [design.tables, enumValues])

  const sampleValidation = useMemo(
    () => validateTableRows(definition, samples, context),
    [context, definition, samples],
  )
  const testValidation = useMemo(
    () => validateTableRows(definition, testRows, context),
    [context, definition, testRows],
  )

  const columnConfig = useMemo(() => new Map(definition.columns.map((column) => {
    const classification = classifyColumnType(column.type, enumNames)
    const values = classification.kind === 'enum'
      ? enumValues.get(classification.name) ?? []
      : []
    return [column.name, { classification, enumValues: values } satisfies ColumnConfig]
  })), [definition.columns, enumNames, enumValues])

  const gridColumns: RowGridColumn[] = definition.columns.map((column) => {
    const markers = [
      definition.primaryKey?.columns.includes(column.name) ? 'PK' : '',
      column.nullable ? '' : 'NOT NULL',
    ].filter(Boolean)
    return {
      key: column.name,
      header: column.name,
      detail: <>{column.type}{markers.length > 0 ? ` · ${markers.join(' · ')}` : ''}</>,
    }
  })

  function setSampleCell(index: number, column: string, value: string | null): void {
    onChangeSamples(samples.map((row, at) => (
      at === index ? { ...row, [column]: value } : row
    )))
  }

  function setTestCell(index: number, column: string, value: string | null): void {
    onChangeTestRows(testRows.map((row, at) => (
      at === index ? { ...row, [column]: value } : row
    )))
  }

  function gridRows(
    entries: Array<{ row: TableRow; index: number; result: TableRowValidation['rows'][number] }>,
    kind: 'sample' | 'test',
  ): RowGridRow[] {
    const prefix = kind === 'sample' ? 'Sample' : 'Test'
    return entries.map(({ row, index, result }) => {
      const cells: Record<string, RowGridCell> = {}
      for (const column of definition.columns) {
        const label = `${prefix} row ${index + 1} ${column.name}`
        const config = columnConfig.get(column.name)
        const message = result.cells[column.name]
        cells[column.name] = {
          content: (
            <TableRowCell
              config={config ?? { classification: { kind: 'native', type: column.type }, enumValues: [] }}
              label={label}
              value={row[column.name] ?? null}
              onChange={(value) => (
                kind === 'sample'
                  ? setSampleCell(index, column.name, value)
                  : setTestCell(index, column.name, value)
              )}
            />
          ),
          message,
          inlineMessage: message
            ? <small className="database-cell-message">{message}</small>
            : undefined,
        }
      }
      return {
        key: `${kind}-${index}`,
        index,
        valid: result.valid,
        cells,
      }
    })
  }

  function addSampleRow(): void {
    if (samples.length >= SAMPLE_LIMIT) return
    onChangeSamples([...samples, {}])
  }

  function generateSampleRow(): void {
    if (samples.length >= SAMPLE_LIMIT || definition.columns.length === 0) return
    onChangeSamples([...samples, generateTableRow(definition, context, samples)])
  }

  function importRows(): void {
    setPasteError('')
    const text = pasteText.trim()
    if (!text) return
    try {
      const result = parsePastedRows(text, definition.columns)
      onChangeTestRows(result.rows.slice(0, TEST_LIMIT))
      setIgnoredColumns(result.ignored)
      setPasteOpen(false)
      setPasteText('')
    } catch (cause) {
      setPasteError(cause instanceof Error ? cause.message : 'Could not read rows.')
    }
  }

  const visibleTestRows = testRows.flatMap((row, index) => {
    const result = testValidation.rows[index]!
    if (showInvalidOnly && result.valid) return []
    return [{ row, index, result }]
  })

  return (
    <div className="schema-rows-panel database-rows-panel">
      <section className="schema-row-set" aria-label="Sample rows">
        <header className="schema-row-set-head">
          <div>
            <h3>Sample rows</h3>
            <span>{sampleValidation.validCount} of {samples.length} rows valid</span>
          </div>
          <div className="schema-row-actions">
            <span className="database-row-limit">{samples.length} of {SAMPLE_LIMIT} rows</span>
            <button
              type="button"
              className="button"
              onClick={addSampleRow}
              disabled={samples.length >= SAMPLE_LIMIT}
            >
              <Plus size={13} /> Add row
            </button>
            <button
              type="button"
              className="button"
              onClick={generateSampleRow}
              disabled={samples.length >= SAMPLE_LIMIT || definition.columns.length === 0}
            >
              Generate
            </button>
          </div>
        </header>
        {parsedSamples.error && <div className="alert" role="alert">{parsedSamples.error}</div>}
        <ValidationNotes result={sampleValidation} />
        <RowGrid
          columns={gridColumns}
          rows={gridRows(
            samples.map((row, index) => ({ row, index, result: sampleValidation.rows[index]! })),
            'sample',
          )}
          onDelete={(index) => onChangeSamples(samples.filter((_, at) => at !== index))}
          deleteLabel={(index) => `Delete sample row ${index + 1}`}
          emptyText="Add a column in Columns first."
          minWidth={Math.max(760, definition.columns.length * 160)}
        />
      </section>

      <section className="schema-row-set" aria-label="Test data">
        <header className="schema-row-set-head">
          <div>
            <h3>Test data</h3>
            <span>{testValidation.validCount} of {testRows.length} rows valid</span>
          </div>
          <div className="schema-row-actions">
            <button
              type="button"
              className="button"
              onClick={() => setPasteOpen((open) => !open)}
            >
              Paste rows
            </button>
            <label className="schema-row-toggle">
              <input
                type="checkbox"
                checked={showInvalidOnly}
                onChange={(event) => setShowInvalidOnly(event.target.checked)}
              />
              Show invalid only
            </label>
            <button
              type="button"
              className="button"
              onClick={() => {
                onChangeTestRows([])
                setIgnoredColumns([])
              }}
              disabled={testRows.length === 0}
            >
              Clear
            </button>
          </div>
        </header>
        {pasteOpen && (
          <div className="schema-row-paste">
            <textarea
              rows={5}
              aria-label="Rows to paste"
              value={pasteText}
              onChange={(event) => setPasteText(event.target.value)}
              placeholder="JSON array, or CSV with a header row of column names."
            />
            <div className="schema-row-paste-actions">
              <button
                type="button"
                className="button primary"
                onClick={importRows}
                disabled={!pasteText.trim()}
              >
                Import rows
              </button>
              <span>{testRows.length} of 1,000 rows</span>
            </div>
            {pasteError && <div className="alert" role="alert">{pasteError}</div>}
          </div>
        )}
        {ignoredColumns.length > 0 && (
          <div className="database-rows-note" role="status">
            Ignored columns: {ignoredColumns.join(', ')}
          </div>
        )}
        <ValidationNotes result={testValidation} />
        <RowGrid
          columns={gridColumns}
          rows={gridRows(
            visibleTestRows.map((entry) => ({
              row: entry.row,
              index: entry.index,
              result: entry.result,
            })),
            'test',
          )}
          emptyText="Paste rows or add columns first."
          minWidth={Math.max(760, definition.columns.length * 160)}
        />
      </section>
    </div>
  )
}

function ValidationNotes({ result }: { result: TableRowValidation }) {
  if (!result.checksNotEvaluated && result.uncheckedColumns.length === 0) return null
  return (
    <div className="database-row-notes">
      {result.checksNotEvaluated && <span>Checks not evaluated</span>}
      {result.uncheckedColumns.length > 0 && (
        <span title={result.uncheckedColumns.join(', ')}>
          {result.uncheckedColumns.length} columns not checked
        </span>
      )}
    </div>
  )
}

function TableRowCell({
  config,
  label,
  value,
  onChange,
}: {
  config: ColumnConfig
  label: string
  value: string | null
  onChange: (value: string | null) => void
}) {
  const [custom, setCustom] = useState(false)
  const { classification, enumValues } = config

  if (classification.kind === 'enum' && !custom) {
    return (
      <select
        aria-label={label}
        value={value === null ? '__null__' : value}
        onChange={(event) => {
          if (event.target.value === '__other__') {
            setCustom(true)
          } else if (event.target.value === '__null__') {
            onChange(null)
          } else {
            onChange(event.target.value)
          }
        }}
      >
        <option value="__null__">Empty (NULL)</option>
        {enumValues.map((option) => <option key={option} value={option}>{option}</option>)}
        {value !== null && !enumValues.includes(value) && (
          <option value={value}>{value}</option>
        )}
        <option value="__other__">Other…</option>
      </select>
    )
  }

  if (classification.kind === 'neutral' && classification.type === 'boolean' && !custom) {
    return (
      <div className="schema-cell-input database-boolean-cell">
        <input
          type="checkbox"
          role="switch"
          aria-label={label}
          checked={value === 'true'}
          onChange={(event) => onChange(event.target.checked ? 'true' : 'false')}
        />
        <span className="database-boolean-value">
          {value === null ? 'Empty (NULL)' : value}
        </span>
        <button
          type="button"
          className="schema-null-toggle"
          aria-label={`Set ${label} empty (NULL)`}
          title="Empty (NULL)"
          onClick={() => onChange(null)}
        >∅</button>
        <button
          type="button"
          className="schema-null-toggle"
          aria-label={`Use custom value for ${label}`}
          title="Custom value"
          onClick={() => setCustom(true)}
        >…</button>
      </div>
    )
  }

  const number = classification.kind === 'neutral'
    && (classification.type === 'integer'
      || classification.type === 'bigint'
      || classification.type === 'decimal')
  const date = classification.kind === 'neutral' && classification.type === 'date'
  const timestamp = classification.kind === 'neutral' && classification.type === 'timestamp'
  const step = classification.kind === 'neutral' && classification.type === 'decimal' ? 'any' : '1'

  return (
    <div className="schema-cell-input">
      <input
        aria-label={label}
        type={number ? 'number' : date ? 'date' : timestamp ? 'datetime-local' : 'text'}
        step={number ? step : timestamp ? 1 : undefined}
        placeholder={number || date || timestamp ? undefined : 'Empty (NULL)'}
        value={timestamp
          ? (value === null ? '' : dateTimeInputValue(value))
          : value ?? ''}
        onChange={(event) => {
          const text = event.target.value
          if (text === '') onChange(null)
          else if (timestamp) onChange(rfc3339FromLocalDateTime(text))
          else onChange(text)
        }}
      />
      {custom && (
        <button
          type="button"
          className="schema-null-toggle"
          aria-label={`Use list for ${label}`}
          title="Use list"
          onClick={() => setCustom(false)}
        >≡</button>
      )}
      <button
        type="button"
        className={`schema-null-toggle${value === null ? ' active' : ''}`}
        aria-label={`Set ${label} empty (NULL)`}
        title="Empty (NULL)"
        onClick={() => onChange(null)}
      >∅</button>
    </div>
  )
}
