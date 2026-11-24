import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import {
  emptyTableDefinition,
  parseTableDefinition,
  parseTableSamplesValue,
  removeTableSampleColumn,
  renameTableSampleColumn,
  stringifyTableDefinition,
  stringifyTableSamples,
  tableDefinitionError,
  type ForeignKeyAction,
  type TableColumn,
  type TableDefinition,
  type TableForeignKey,
  type TableIndex,
  type TableRow,
} from '@canvas/contract'

import { useDatabaseDesign, type DatabaseTableOption } from './DatabaseDesignContext'
import { TableRowsEditor } from './TableRowsEditor'

const NEUTRAL_TYPE_OPTIONS = [
  'text',
  'varchar(255)',
  'integer',
  'bigint',
  'decimal(10,2)',
  'boolean',
  'uuid',
  'date',
  'timestamp',
  'json',
  'binary',
]

const POSTGRES_NATIVE_TYPES = [
  'timestamp without time zone',
  'time with time zone',
  'time without time zone',
  'smallint',
  'jsonb',
  'inet',
  'cidr',
  'macaddr',
  'real',
  'double precision',
  'money',
  'interval',
  'xml',
  'tsvector',
]

const ACTIONS: ForeignKeyAction[] = ['no_action', 'restrict', 'cascade', 'set_null', 'set_default']

function actionLabel(action: ForeignKeyAction): string {
  return action.replaceAll('_', ' ').toUpperCase()
}

function columnNames(value: string): string[] {
  return value.split(',').map((name) => name.trim()).filter(Boolean)
}

function optionalText(value: string): string | undefined {
  return value.trim() ? value : undefined
}

function renameReferences(definition: TableDefinition, oldName: string, newName: string): TableDefinition {
  if (!newName || oldName === newName) return definition
  return {
    ...definition,
    ...(definition.primaryKey
      ? {
        primaryKey: {
          ...definition.primaryKey,
          columns: definition.primaryKey.columns.map((name) => name === oldName ? newName : name),
        },
      }
      : {}),
    uniques: definition.uniques.map((unique) => ({
      ...unique,
      columns: unique.columns.map((name) => name === oldName ? newName : name),
    })),
    foreignKeys: definition.foreignKeys.map((foreignKey) => ({
      ...foreignKey,
      columns: foreignKey.columns.map((name) => name === oldName ? newName : name),
    })),
    indexes: definition.indexes.map((index) => ({
      ...index,
      columns: index.columns.map((name) => name === oldName ? newName : name),
    })),
  }
}

function removeColumnFromDefinition(definition: TableDefinition, columnName: string): TableDefinition {
  const primaryColumns = definition.primaryKey?.columns.filter((name) => name !== columnName) ?? []
  return {
    ...definition,
    columns: definition.columns.filter((column) => column.name !== columnName),
    ...(definition.primaryKey && primaryColumns.length > 0
      ? {
        primaryKey: {
          ...definition.primaryKey,
          columns: primaryColumns,
        },
      }
      : {}),
    uniques: definition.uniques
      .map((unique) => ({
        ...unique,
        columns: unique.columns.filter((name) => name !== columnName),
      }))
      .filter((unique) => unique.columns.length > 0),
    foreignKeys: definition.foreignKeys
      .map((foreignKey) => ({
        ...foreignKey,
        columns: foreignKey.columns.filter((name) => name !== columnName),
      }))
      .filter((foreignKey) => foreignKey.columns.length > 0),
    indexes: definition.indexes
      .map((index) => ({
        ...index,
        columns: index.columns.filter((name) => name !== columnName),
      }))
      .filter((index) => index.columns.length > 0),
  }
}

function uniqueColumnName(columns: TableColumn[]): string {
  const used = new Set(columns.map((column) => column.name))
  let index = 1
  let name = 'new_column'
  while (used.has(name)) {
    index += 1
    name = `new_column_${index}`
  }
  return name
}

function referenceColumns(table: DatabaseTableOption): string[] {
  return table.primaryKey.length > 0 ? table.primaryKey : table.columns.slice(0, 1)
}

function tableOptionKey(table: { schema: string; name?: string; table?: string }): string {
  return `${table.schema}.${table.name ?? table.table ?? ''}`
}

export function TableEditor({
  fields,
  onChange,
}: {
  fields: Record<string, string | number | null>
  onChange: (key: string, value: string) => void
}) {
  const design = useDatabaseDesign()
  const parsed = parseTableDefinition(fields.definition)
  const definition = parsed ?? emptyTableDefinition()
  const samplesValue = fields.samples
  const samplesPresent = samplesValue != null && String(samplesValue).trim() !== ''
  const samples = parseTableSamplesValue(samplesValue)
  const [tab, setTab] = useState<'columns' | 'rows'>('columns')
  const [testRows, setTestRows] = useState<TableRow[]>([])
  const [validationError, setValidationError] = useState('')
  const [expandedColumns, setExpandedColumns] = useState<ReadonlySet<number>>(new Set())
  const [focusColumnIndex, setFocusColumnIndex] = useState<number | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (focusColumnIndex === null) return
    const input = gridRef.current?.querySelector<HTMLInputElement>(
      `input[aria-label="Column ${focusColumnIndex + 1} name"]`,
    )
    if (!input) return
    input.focus()
    input.select()
    setFocusColumnIndex(null)
  }, [definition.columns.length, focusColumnIndex])

  function addColumn(): void {
    const nextIndex = definition.columns.length
    commit({
      ...definition,
      columns: [
        ...definition.columns,
        { name: uniqueColumnName(definition.columns), type: 'text', nullable: true },
      ],
    })
    setFocusColumnIndex(nextIndex)
  }

  function toggleColumnMore(index: number): void {
    setExpandedColumns((current) => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  function commit(next: TableDefinition, nextSamples?: TableRow[]): void {
    if (next.columns.length === 0) {
      setValidationError('A table needs at least one column.')
      return
    }
    const error = tableDefinitionError(next)
    if (error) {
      setValidationError(error)
      return
    }
    setValidationError('')
    onChange('definition', stringifyTableDefinition(next))
    if (nextSamples !== undefined) {
      onChange('samples', nextSamples.length > 0 ? stringifyTableSamples(nextSamples) : '')
    }
  }

  const thisSchema = String(fields.schema ?? 'public').trim() || 'public'
  const thisName = String(fields.name ?? '').trim()
  const otherTables = design.tables.filter((table) => (
    table.name !== thisName || table.schema !== thisSchema
  ))
  const orderedParents = [
    ...otherTables.filter((table) => table.schema === thisSchema),
    ...otherTables.filter((table) => table.schema !== thisSchema),
  ]
  const addedForeignKeyParent = orderedParents.find((table) => referenceColumns(table).length > 0)
  const primaryColumns = new Set(definition.primaryKey?.columns ?? [])
  const addedForeignKeyColumn = (
    definition.columns.find((column) => !primaryColumns.has(column.name)) ?? definition.columns[0]
  )?.name
  const canAddForeignKey = Boolean(addedForeignKeyParent && addedForeignKeyColumn)
  const addForeignKeyHint = definition.columns.length === 0
    ? 'Add a column first'
    : otherTables.length === 0
      ? 'Add another table first'
      : 'Add a table with columns first'

  function addForeignKey(): void {
    if (!addedForeignKeyParent || !addedForeignKeyColumn) return
    commit({
      ...definition,
      foreignKeys: [
        ...definition.foreignKeys,
        {
          columns: [addedForeignKeyColumn],
          references: {
            schema: addedForeignKeyParent.schema,
            table: addedForeignKeyParent.name,
            columns: referenceColumns(addedForeignKeyParent),
          },
        },
      ],
    })
  }

  function updateColumn(index: number, patch: Partial<TableColumn>): void {
    const current = definition.columns[index]
    if (!current) return
    const required = patch.identity === 'always' || patch.identity === 'by_default'
    let next: TableDefinition = {
      ...definition,
      columns: definition.columns.map((column, position) => (
        position === index
          ? { ...column, ...patch, ...(required ? { nullable: false } : {}) }
          : column
      )),
    }
    if (patch.name !== undefined) next = renameReferences(next, current.name, patch.name)
    const nextSamples = patch.name !== undefined
      && patch.name !== current.name
      && samplesPresent
      && !samples.error
      ? renameTableSampleColumn(samples.rows, current.name, patch.name)
      : undefined
    commit(next, nextSamples)
  }

  function removeColumn(columnName: string): void {
    const nextSamples = samplesPresent && !samples.error
      ? removeTableSampleColumn(samples.rows, columnName)
      : undefined
    commit(removeColumnFromDefinition(definition, columnName), nextSamples)
  }

  function moveColumn(index: number, direction: -1 | 1): void {
    const target = index + direction
    if (target < 0 || target >= definition.columns.length) return
    const columns = [...definition.columns]
    const value = columns[index]!
    columns[index] = columns[target]!
    columns[target] = value
    commit({ ...definition, columns })
  }

  function togglePrimary(column: TableColumn): void {
    const current = definition.primaryKey?.columns ?? []
    const columns = current.includes(column.name)
      ? current.filter((name) => name !== column.name)
      : [...current, column.name]
    const primary = new Set(columns)
    commit({
      ...definition,
      columns: definition.columns.map((candidate) => (
        primary.has(candidate.name) ? { ...candidate, nullable: false } : candidate
      )),
      ...(columns.length > 0
        ? { primaryKey: { ...(definition.primaryKey?.name ? { name: definition.primaryKey.name } : {}), columns } }
        : { primaryKey: undefined }),
    })
  }

  function toggleUnique(column: TableColumn): void {
    const existing = definition.uniques.find((unique) => (
      unique.columns.length === 1 && unique.columns[0] === column.name
    ))
    commit({
      ...definition,
      uniques: existing
        ? definition.uniques.filter((unique) => unique !== existing)
        : [...definition.uniques, { columns: [column.name] }],
    })
  }

  function updateUnique(index: number, patch: Partial<TableDefinition['uniques'][number]>): void {
    commit({
      ...definition,
      uniques: definition.uniques.map((unique, position) => (
        position === index ? { ...unique, ...patch } : unique
      )),
    })
  }

  function updateForeignKey(index: number, patch: Partial<TableForeignKey>): void {
    commit({
      ...definition,
      foreignKeys: definition.foreignKeys.map((foreignKey, position) => (
        position === index ? { ...foreignKey, ...patch } : foreignKey
      )),
    })
  }

  function updateIndex(index: number, patch: Partial<TableIndex>): void {
    commit({
      ...definition,
      indexes: definition.indexes.map((item, position) => (
        position === index ? { ...item, ...patch } : item
      )),
    })
  }

  const typeOptions = [
    ...NEUTRAL_TYPE_OPTIONS,
    ...design.enums.map((item) => item.schema === 'public' ? item.name : `${item.schema}.${item.name}`),
    ...(design.target === 'postgres' ? POSTGRES_NATIVE_TYPES : []),
  ]

  return (
    <div className="database-table-editor">
      <div className="api-endpoint-tabs" role="tablist" aria-label="Table editor">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'columns'}
          className={tab === 'columns' ? 'active' : ''}
          onClick={() => setTab('columns')}
        >
          Columns
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'rows'}
          className={tab === 'rows' ? 'active' : ''}
          onClick={() => setTab('rows')}
        >
          Rows
        </button>
      </div>
      {tab === 'rows' ? (
        <TableRowsEditor
          definition={definition}
          samplesSource={samplesValue}
          testRows={testRows}
          onChangeSamples={(rows) => onChange('samples', rows.length > 0 ? stringifyTableSamples(rows) : '')}
          onChangeTestRows={setTestRows}
        />
      ) : (
        <>
      <div className="database-editor-fields">
        <label className="name-dialog-field">
          Name
          <input
            value={String(fields.name ?? '')}
            onChange={(event) => onChange('name', event.target.value)}
            placeholder="table_name"
          />
        </label>
        <label className="name-dialog-field">
          Schema
          <input
            value={String(fields.schema ?? 'public')}
            onChange={(event) => onChange('schema', event.target.value)}
            list="database-schema-suggestions"
            placeholder="public"
          />
        </label>
        <label className="name-dialog-field">
          Status
          <select
            value={String(fields.status ?? 'active')}
            onChange={(event) => onChange('status', event.target.value)}
          >
            <option value="planned">Planned</option>
            <option value="active">Active</option>
            <option value="deprecated">Deprecated</option>
          </select>
        </label>
      </div>
      <datalist id="database-schema-suggestions">
        {design.schemas.map((schema) => <option key={schema} value={schema} />)}
      </datalist>

      <label className="name-dialog-field database-description-field">
        Description
        <textarea
          rows={2}
          value={String(fields.description ?? '')}
          onChange={(event) => onChange('description', event.target.value)}
        />
      </label>

      {!parsed && (
        <div className="alert" role="alert">
          The Definition JSON is invalid. Fix it below or edit it as text.
        </div>
      )}
      {validationError && (
        <div className="alert" role="alert">
          {validationError}
        </div>
      )}

      <section className="database-editor-section">
        <header>
          <h3>Columns</h3>
          <button type="button" className="button" onClick={addColumn}>
            <Plus size={14} /> Add column
          </button>
        </header>
        <div className="database-column-grid" ref={gridRef}>
          <div className="database-grid-head">
            <span>Name</span>
            <span>Type</span>
            <span>Not null</span>
            <span>Default</span>
            <span>PK</span>
            <span>UQ</span>
            <span />
          </div>
          {definition.columns.map((column, index) => {
            const expanded = expandedColumns.has(index)
            const panelId = `database-column-more-${index}`
            return (
              <div className="database-column-entry" key={`column-${index}`}>
                <div className="database-grid-row">
                  <input
                    aria-label={`Column ${index + 1} name`}
                    value={column.name}
                    onChange={(event) => updateColumn(index, { name: event.target.value })}
                  />
                  <input
                    aria-label={`Column ${index + 1} type`}
                    value={column.type}
                    list="database-type-suggestions"
                    onChange={(event) => updateColumn(index, { type: event.target.value })}
                  />
                  <label className="database-check">
                    <input
                      type="checkbox"
                      aria-label={`Column ${index + 1} not null`}
                      checked={!column.nullable}
                      onChange={(event) => updateColumn(index, { nullable: !event.target.checked })}
                    />
                  </label>
                  <input
                    aria-label={`Column ${index + 1} default`}
                    value={column.default ?? ''}
                    onChange={(event) => {
                      const nextDefault = optionalText(event.target.value)
                      updateColumn(index, {
                        default: nextDefault,
                        ...(nextDefault ? { identity: undefined, generated: undefined } : {}),
                      })
                    }}
                  />
                  <label className="database-check">
                    <input
                      type="checkbox"
                      aria-label={`Column ${index + 1} primary key`}
                      checked={definition.primaryKey?.columns.includes(column.name) ?? false}
                      onChange={() => togglePrimary(column)}
                    />
                  </label>
                  <label className="database-check">
                    <input
                      type="checkbox"
                      aria-label={`Column ${index + 1} unique`}
                      checked={definition.uniques.some((unique) => (
                        unique.columns.length === 1 && unique.columns[0] === column.name
                      ))}
                      onChange={() => toggleUnique(column)}
                    />
                  </label>
                  <span className="database-row-actions">
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`More for ${column.name}`}
                      aria-expanded={expanded}
                      aria-controls={panelId}
                      onClick={() => toggleColumnMore(index)}
                    >
                      {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    </button>
                    <button type="button" className="icon-button" aria-label={`Move ${column.name} up`} onClick={() => moveColumn(index, -1)}>
                      <ArrowUp size={13} />
                    </button>
                    <button type="button" className="icon-button" aria-label={`Move ${column.name} down`} onClick={() => moveColumn(index, 1)}>
                      <ArrowDown size={13} />
                    </button>
                    <button type="button" className="icon-button" aria-label={`Remove ${column.name}`} onClick={() => removeColumn(column.name)}>
                      <Trash2 size={13} />
                    </button>
                  </span>
                </div>
                {expanded && (
                  <div className="database-column-extra" id={panelId}>
                    <label className="database-column-extra-field">
                      <span>Identity</span>
                      <select
                        aria-label={`Column ${index + 1} identity`}
                        value={column.identity ?? ''}
                        onChange={(event) => updateColumn(index, {
                          identity: event.target.value ? event.target.value as 'always' | 'by_default' : undefined,
                          ...(event.target.value ? { default: undefined } : {}),
                        })}
                      >
                        <option value="">None</option>
                        <option value="by_default">By default</option>
                        <option value="always">Always</option>
                      </select>
                    </label>
                    <label className="database-column-extra-field">
                      <span>Generated</span>
                      <input
                        aria-label={`Column ${index + 1} generated`}
                        value={column.generated ?? ''}
                        placeholder="expression"
                        onChange={(event) => {
                          const nextGenerated = optionalText(event.target.value)
                          updateColumn(index, {
                            generated: nextGenerated,
                            ...(nextGenerated ? { default: undefined, identity: undefined } : {}),
                          })
                        }}
                      />
                    </label>
                    <label className="database-column-extra-field">
                      <span>Comment</span>
                      <input
                        aria-label={`Column ${index + 1} comment`}
                        value={column.comment ?? ''}
                        placeholder="comment"
                        onChange={(event) => updateColumn(index, {
                          comment: optionalText(event.target.value),
                        })}
                      />
                    </label>
                  </div>
                )}
              </div>
            )
          })}
          <button
            type="button"
            className="button database-add-column-row"
            onClick={addColumn}
          >
            <Plus size={14} /> Add column
          </button>
        </div>
        <datalist id="database-type-suggestions">
          {typeOptions.map((type) => <option key={type} value={type} />)}
        </datalist>
      </section>

      <section className="database-editor-section">
        <header>
          <h3>Unique constraints</h3>
          <button
            type="button"
            className="button"
            disabled={definition.columns.length === 0}
            onClick={() => commit({
              ...definition,
              uniques: [
                ...definition.uniques,
                { columns: [definition.columns[0]!.name] },
              ],
            })}
          >
            <Plus size={14} /> Add unique
          </button>
        </header>
        {definition.uniques.map((unique, index) => (
          <div className="database-subgrid" key={`unique-${index}`}>
            <input
              aria-label={`Unique ${index + 1} name`}
              value={unique.name ?? ''}
              onChange={(event) => updateUnique(index, { name: optionalText(event.target.value) })}
              placeholder="constraint name"
            />
            <input
              aria-label={`Unique ${index + 1} columns`}
              value={unique.columns.join(', ')}
              onChange={(event) => updateUnique(index, { columns: columnNames(event.target.value) })}
              placeholder="column, column"
            />
            <button
              type="button"
              className="icon-button"
              aria-label={`Remove unique ${index + 1}`}
              onClick={() => commit({
                ...definition,
                uniques: definition.uniques.filter((_, position) => position !== index),
              })}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </section>

      <section className="database-editor-section">
        <header>
          <h3>Checks</h3>
          <button
            type="button"
            className="button"
            onClick={() => commit({
              ...definition,
              checks: [...definition.checks, { expression: 'true' }],
            })}
          >
            <Plus size={14} /> Add check
          </button>
        </header>
        {definition.checks.map((check, index) => (
          <div className="database-subgrid database-check-grid" key={`check-${index}`}>
            <input
              aria-label={`Check ${index + 1} name`}
              value={check.name ?? ''}
              onChange={(event) => commit({
                ...definition,
                checks: definition.checks.map((item, position) => (
                  position === index
                    ? { ...item, name: optionalText(event.target.value) }
                    : item
                )),
              })}
              placeholder="constraint name"
            />
            <input
              aria-label={`Check ${index + 1} expression`}
              value={check.expression}
              onChange={(event) => {
                if (!event.target.value.trim()) {
                  commit({
                    ...definition,
                    checks: definition.checks.filter((_, position) => position !== index),
                  })
                  return
                }
                commit({
                  ...definition,
                  checks: definition.checks.map((item, position) => (
                    position === index
                      ? { ...item, expression: event.target.value }
                      : item
                  )),
                })
              }}
              placeholder="expression"
            />
            <button
              type="button"
              className="icon-button"
              aria-label={`Remove check ${index + 1}`}
              onClick={() => commit({
                ...definition,
                checks: definition.checks.filter((_, position) => position !== index),
              })}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </section>

      <section className="database-editor-section">
        <header>
          <h3>Foreign keys</h3>
          <span className="database-editor-actions">
            {!canAddForeignKey && <span className="database-editor-hint">{addForeignKeyHint}</span>}
            <button
              type="button"
              className="button"
              disabled={!canAddForeignKey}
              onClick={addForeignKey}
            >
              <Plus size={14} /> Add foreign key
            </button>
          </span>
        </header>
        {definition.foreignKeys.map((foreignKey, index) => {
          const selectedTable = tableOptionKey(foreignKey.references)
          const selectedKnown = design.tables.some((table) => tableOptionKey(table) === selectedTable)
          return (
          <div className="database-subgrid" key={`fk-${index}`}>
            <input
              aria-label={`Foreign key ${index + 1} columns`}
              value={foreignKey.columns.join(', ')}
              onChange={(event) => updateForeignKey(index, { columns: columnNames(event.target.value) })}
              placeholder="column"
            />
            <span className="database-subgrid-arrow">→</span>
            <select
              aria-label={`Foreign key ${index + 1} table`}
              value={selectedTable}
              onChange={(event) => {
                const table = design.tables.find((candidate) => (
                  tableOptionKey(candidate) === event.target.value
                ))
                if (!table) return
                updateForeignKey(index, {
                  references: {
                    schema: table.schema,
                    table: table.name,
                    columns: referenceColumns(table),
                  },
                })
              }}
            >
              {!selectedKnown && foreignKey.references.table && (
                <option value={selectedTable}>{selectedTable}</option>
              )}
              {design.tables.map((table) => (
                <option key={tableOptionKey(table)} value={tableOptionKey(table)}>
                  {tableOptionKey(table)}
                </option>
              ))}
            </select>
            <input
              aria-label={`Foreign key ${index + 1} referenced columns`}
              value={foreignKey.references.columns.join(', ')}
              onChange={(event) => updateForeignKey(index, {
                references: { ...foreignKey.references, columns: columnNames(event.target.value) },
              })}
              placeholder="id"
            />
            <select
              aria-label={`Foreign key ${index + 1} on delete`}
              value={foreignKey.onDelete ?? 'no_action'}
              onChange={(event) => updateForeignKey(index, {
                onDelete: event.target.value as ForeignKeyAction,
              })}
            >
              {ACTIONS.map((action) => <option key={action} value={action}>{actionLabel(action)}</option>)}
            </select>
            <select
              aria-label={`Foreign key ${index + 1} on update`}
              value={foreignKey.onUpdate ?? 'no_action'}
              onChange={(event) => updateForeignKey(index, {
                onUpdate: event.target.value as ForeignKeyAction,
              })}
            >
              {ACTIONS.map((action) => <option key={action} value={action}>{actionLabel(action)}</option>)}
            </select>
            <button
              type="button"
              className="icon-button"
              aria-label={`Remove foreign key ${index + 1}`}
              onClick={() => commit({
                ...definition,
                foreignKeys: definition.foreignKeys.filter((_, position) => position !== index),
              })}
            >
              <Trash2 size={13} />
            </button>
          </div>
          )
        })}
      </section>

      <section className="database-editor-section">
        <header>
          <h3>Indexes</h3>
          <button
            type="button"
            className="button"
            onClick={() => commit({
              ...definition,
              indexes: [
                ...definition.indexes,
                {
                  name: `${String(fields.name ?? 'table')}_idx`,
                  unique: false,
                  method: 'btree',
                  columns: [definition.columns[0]?.name ?? ''],
                },
              ],
            })}
          >
            <Plus size={14} /> Add index
          </button>
        </header>
        {definition.indexes.map((index, position) => (
          <div className="database-subgrid" key={`index-${position}`}>
            <input
              aria-label={`Index ${position + 1} name`}
              value={index.name}
              onChange={(event) => updateIndex(position, { name: event.target.value })}
              placeholder="table_idx"
            />
            <label className="database-check">
              <input
                type="checkbox"
                aria-label={`Index ${position + 1} unique`}
                checked={index.unique}
                onChange={(event) => updateIndex(position, { unique: event.target.checked })}
              />
              Unique
            </label>
            <input
              aria-label={`Index ${position + 1} method`}
              value={index.method}
              onChange={(event) => updateIndex(position, { method: event.target.value })}
              placeholder="btree"
            />
            <input
              aria-label={`Index ${position + 1} columns`}
              value={index.columns.join(', ')}
              onChange={(event) => updateIndex(position, { columns: columnNames(event.target.value) })}
              placeholder="column"
            />
            <input
              aria-label={`Index ${position + 1} where`}
              value={index.where ?? ''}
              onChange={(event) => updateIndex(position, { where: optionalText(event.target.value) })}
              placeholder="predicate"
            />
            <button
              type="button"
              className="icon-button"
              aria-label={`Remove index ${position + 1}`}
              onClick={() => commit({
                ...definition,
                indexes: definition.indexes.filter((_, item) => item !== position),
              })}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </section>
        </>
      )}
    </div>
  )
}
