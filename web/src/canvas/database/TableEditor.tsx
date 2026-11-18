import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'

import {
  emptyTableDefinition,
  parseTableDefinition,
  stringifyTableDefinition,
  type ForeignKeyAction,
  type TableColumn,
  type TableDefinition,
  type TableForeignKey,
  type TableIndex,
} from '@canvas/contract'

import { useDatabaseDesign } from './DatabaseDesignContext'

const COMMON_TYPES = [
  'uuid',
  'text',
  'character varying(255)',
  'integer',
  'bigint',
  'smallint',
  'numeric(10,2)',
  'boolean',
  'timestamp with time zone',
  'timestamp without time zone',
  'date',
  'time with time zone',
  'jsonb',
  'json',
  'bytea',
  'inet',
  'cidr',
  'macaddr',
]

const ACTIONS: ForeignKeyAction[] = ['no_action', 'restrict', 'cascade', 'set_null', 'set_default']

function actionLabel(action: ForeignKeyAction): string {
  return action.replaceAll('_', ' ').toUpperCase()
}

function columnNames(value: string): string[] {
  return value.split(',').map((name) => name.trim()).filter(Boolean)
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
  return {
    ...definition,
    columns: definition.columns.filter((column) => column.name !== columnName),
    ...(definition.primaryKey
      ? {
        primaryKey: {
          ...definition.primaryKey,
          columns: definition.primaryKey.columns.filter((name) => name !== columnName),
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

  function commit(next: TableDefinition): void {
    onChange('definition', stringifyTableDefinition(next))
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
    commit(next)
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
    ...COMMON_TYPES,
    ...design.enums.map((item) => item.schema === 'public' ? item.name : `${item.schema}.${item.name}`),
  ]

  return (
    <div className="database-table-editor">
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

      <section className="database-editor-section">
        <header>
          <h3>Columns</h3>
          <button
            type="button"
            className="button"
            onClick={() => commit({
              ...definition,
              columns: [
                ...definition.columns,
                { name: uniqueColumnName(definition.columns), type: 'text', nullable: true },
              ],
            })}
          >
            <Plus size={14} /> Add column
          </button>
        </header>
        <div className="database-column-grid">
          <div className="database-grid-head">
            <span>Name</span>
            <span>Type</span>
            <span>Nullable</span>
            <span>Default</span>
            <span>PK</span>
            <span>UQ</span>
            <span>Identity</span>
            <span>Generated</span>
            <span />
          </div>
          {definition.columns.map((column, index) => (
            <div className="database-grid-row" key={`${column.name}-${index}`}>
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
                  aria-label={`Column ${index + 1} nullable`}
                  checked={column.nullable}
                  onChange={(event) => updateColumn(index, { nullable: event.target.checked })}
                />
              </label>
              <input
                aria-label={`Column ${index + 1} default`}
                value={column.default ?? ''}
                onChange={(event) => updateColumn(index, {
                  default: event.target.value,
                  ...(event.target.value ? { identity: undefined, generated: undefined } : {}),
                })}
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
              <input
                aria-label={`Column ${index + 1} generated`}
                value={column.generated ?? ''}
                placeholder="expression"
                onChange={(event) => updateColumn(index, {
                  generated: event.target.value || undefined,
                  ...(event.target.value ? { default: undefined, identity: undefined } : {}),
                })}
              />
              <span className="database-row-actions">
                <button type="button" className="icon-button" aria-label={`Move ${column.name} up`} onClick={() => moveColumn(index, -1)}>
                  <ArrowUp size={13} />
                </button>
                <button type="button" className="icon-button" aria-label={`Move ${column.name} down`} onClick={() => moveColumn(index, 1)}>
                  <ArrowDown size={13} />
                </button>
                <button type="button" className="icon-button" aria-label={`Remove ${column.name}`} onClick={() => commit(removeColumnFromDefinition(definition, column.name))}>
                  <Trash2 size={13} />
                </button>
              </span>
            </div>
          ))}
        </div>
        <datalist id="database-type-suggestions">
          {typeOptions.map((type) => <option key={type} value={type} />)}
        </datalist>
      </section>

      <section className="database-editor-section">
        <header>
          <h3>Foreign keys</h3>
          <button
            type="button"
            className="button"
            onClick={() => commit({
              ...definition,
              foreignKeys: [
                ...definition.foreignKeys,
                {
                  columns: [definition.columns[0]?.name ?? ''],
                  references: { schema: 'public', table: '', columns: ['id'] },
                },
              ],
            })}
          >
            <Plus size={14} /> Add foreign key
          </button>
        </header>
        {definition.foreignKeys.map((foreignKey, index) => (
          <div className="database-subgrid" key={`fk-${index}`}>
            <input
              aria-label={`Foreign key ${index + 1} columns`}
              value={foreignKey.columns.join(', ')}
              onChange={(event) => updateForeignKey(index, { columns: columnNames(event.target.value) })}
              placeholder="column"
            />
            <span className="database-subgrid-arrow">→</span>
            <input
              aria-label={`Foreign key ${index + 1} schema`}
              value={foreignKey.references.schema}
              onChange={(event) => updateForeignKey(index, {
                references: { ...foreignKey.references, schema: event.target.value },
              })}
              placeholder="public"
            />
            <input
              aria-label={`Foreign key ${index + 1} table`}
              value={foreignKey.references.table}
              onChange={(event) => updateForeignKey(index, {
                references: { ...foreignKey.references, table: event.target.value },
              })}
              placeholder="table"
            />
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
        ))}
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
              onChange={(event) => updateIndex(position, { where: event.target.value || undefined })}
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
    </div>
  )
}
