import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import {
  applyFieldEditResult,
  parseFieldModel,
  type FieldEdit,
  type FieldRow,
} from '@canvas/contract'

import type { SchemaCardSource } from '../../schema/schemaCards'

const TYPE_OPTIONS = [
  ['string', 'string'],
  ['number', 'number'],
  ['integer', 'integer'],
  ['boolean', 'boolean'],
  ['object', 'object'],
  ['array:string', 'array of string'],
  ['array:number', 'array of number'],
  ['array:integer', 'array of integer'],
  ['array:boolean', 'array of boolean'],
  ['array:object', 'array of object'],
  ['enum', 'enum'],
  ['ref', 'shared schema'],
] as const

function pathKey(path: string[]): string {
  return path.join('.')
}

function typeValue(row: FieldRow): string {
  if (row.kind === 'array') return `array:${row.details.itemsType || 'string'}`
  return row.kind
}

function flatten(rows: FieldRow[], depth = 0): Array<{ row: FieldRow; depth: number }> {
  return rows.flatMap((row) => [
    { row, depth },
    ...flatten(row.children, depth + 1),
  ])
}

export function FieldsPanel({
  source,
  schemas,
  currentSchemaName,
  onChange,
}: {
  source: string
  schemas: SchemaCardSource[]
  currentSchemaName: string
  onChange: (source: string) => void
}) {
  const sharedSchemas = schemas.filter((schema) => schema.name !== currentSchemaName)
  const model = parseFieldModel(source)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [editError, setEditError] = useState('')
  const rows = flatten(model.rows)

  function edit(operation: FieldEdit) {
    const result = applyFieldEditResult(source, operation)
    setEditError(result.error ?? '')
    if (!result.error) onChange(result.source)
  }

  function changeType(row: FieldRow, value: string) {
    if (value === 'ref') {
      const target = sharedSchemas[0]
      if (target) edit({ type: 'setRef', path: row.path, name: target.name })
      return
    }
    if (value.startsWith('array:')) {
      edit({ type: 'setType', path: row.path, kind: 'array', itemsType: value.slice(6) })
      return
    }
    edit({ type: 'setType', path: row.path, kind: value as FieldRow['kind'] })
  }

  function setDetails(row: FieldRow, patch: Record<string, string | number | undefined>) {
    edit({ type: 'setDetails', path: row.path, details: patch })
  }

  if (model.rootAdvanced || model.rootKind !== 'object') {
    return (
      <div className="schema-fix-json">
        <strong>Advanced schema</strong>
        <p>The root schema is not a plain object. Edit it in JSON.</p>
      </div>
    )
  }

  return (
    <div className="schema-fields-panel">
      <div className="schema-panel-actions">
        <button type="button" className="button" onClick={() => edit({ type: 'add', parentPath: [] })}>
          <Plus size={14} /> Add field
        </button>
        <span className="api-endpoint-muted">{rows.length} field{rows.length === 1 ? '' : 's'}</span>
      </div>
      {editError && <div className="schema-field-error" role="alert">{editError}</div>}
      {rows.length === 0 ? (
        <p className="schema-table-empty">No properties yet. Add the first field.</p>
      ) : (
        <div className="schema-fields-scroll">
          <table className="schema-fields-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Required</th>
                <th>Nullable</th>
                <th>Description</th>
                <th>Details</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ row, depth }) => {
                const key = pathKey(row.path)
                const open = expanded[key] === true
                if (row.advanced) {
                  return (
                    <tr key={key} className="schema-field-advanced">
                      <td style={{ paddingLeft: 8 + depth * 16 }}><strong>{row.name}</strong></td>
                      <td colSpan={6}>Advanced, edit in JSON</td>
                    </tr>
                  )
                }
                return [
                  <tr key={key}>
                    <td style={{ paddingLeft: 8 + depth * 16 }}>
                      <input
                        aria-label={`Field name ${key}`}
                        defaultValue={row.name}
                        onBlur={(event) => {
                          const name = event.currentTarget.value.trim()
                          if (!name || name === row.name) {
                            event.currentTarget.value = row.name
                            return
                          }
                          edit({ type: 'rename', path: row.path, name })
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') event.currentTarget.blur()
                        }}
                      />
                      {row.kind === 'object' && (
                        <button
                          type="button"
                          className="schema-add-child"
                          aria-label={`Add field under ${row.name}`}
                          onClick={() => edit({ type: 'add', parentPath: row.path })}
                        >
                          <Plus size={11} />
                        </button>
                      )}
                    </td>
                    <td>
                      <div className="schema-type-cell">
                        <select aria-label={`Field type ${key}`} value={typeValue(row)} onChange={(event) => changeType(row, event.target.value)}>
                          {TYPE_OPTIONS.map(([value, label]) => (
                            <option key={value} value={value} disabled={value === 'ref' && sharedSchemas.length === 0}>{label}</option>
                          ))}
                        </select>
                        {row.kind === 'ref' && (
                          <select
                            aria-label={`Shared schema ${key}`}
                            value={row.ref}
                            onChange={(event) => edit({ type: 'setRef', path: row.path, name: event.target.value })}
                          >
                            {sharedSchemas.map((schema) => (
                              <option key={schema.name} value={schema.name}>{schema.name}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Required ${key}`}
                        checked={row.required}
                        onChange={(event) => edit({ type: 'setRequired', path: row.path, required: event.target.checked })}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Nullable ${key}`}
                        checked={row.nullable}
                        disabled={row.kind === 'ref'}
                        onChange={(event) => edit({ type: 'setNullable', path: row.path, nullable: event.target.checked })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Description ${key}`}
                        value={row.description}
                        onChange={(event) => edit({ type: 'setDescription', path: row.path, description: event.target.value })}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="button ghost schema-details-toggle"
                        aria-expanded={open}
                        onClick={() => setExpanded((current) => ({ ...current, [key]: !open }))}
                      >
                        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Details
                      </button>
                    </td>
                    <td>
                      <button type="button" className="icon-button" aria-label={`Move ${key} up`} onClick={() => edit({ type: 'move', path: row.path, direction: -1 })}>
                        <ArrowUp size={12} />
                      </button>
                      <button type="button" className="icon-button" aria-label={`Move ${key} down`} onClick={() => edit({ type: 'move', path: row.path, direction: 1 })}>
                        <ArrowDown size={12} />
                      </button>
                      <button type="button" className="icon-button" aria-label={`Delete ${key}`} onClick={() => edit({ type: 'delete', path: row.path })}>
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>,
                  open && (
                    <tr key={`${key}:details`} className="schema-field-details-row">
                      <td colSpan={7}>
                        <FieldDetails
                          row={row}
                          onChange={(patch) => setDetails(row, patch)}
                          onEnum={(values) => edit({ type: 'setEnum', path: row.path, values })}
                        />
                      </td>
                    </tr>
                  ),
                ]
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function EnumValuesEditor({
  values,
  onChange,
}: {
  values: string[]
  onChange: (values: string[]) => void
}) {
  return (
    <label className="entity-field schema-enum-details">
      <span>Enum values</span>
      <textarea
        rows={3}
        defaultValue={values.join('\n')}
        onBlur={(event) => onChange(event.currentTarget.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))}
      />
    </label>
  )
}

function FieldDetails({
  row,
  onChange,
  onEnum,
}: {
  row: FieldRow
  onChange: (patch: Record<string, string | number | undefined>) => void
  onEnum: (values: string[]) => void
}) {
  return (
    <div className="schema-field-details">
      {(row.kind === 'string' || row.kind === 'enum') && (
        <label className="entity-field">
          <span>Format</span>
          <select value={row.details.format} onChange={(event) => onChange({ format: event.target.value })}>
            <option value="">None</option>
            {['date', 'date-time', 'uri', 'email', 'uuid'].map((format) => <option key={format} value={format}>{format}</option>)}
          </select>
        </label>
      )}
      {row.kind === 'string' && (
        <>
          <label className="entity-field"><span>Min length</span><input type="number" min={0} value={row.details.minLength} onChange={(event) => onChange({ minLength: event.target.value })} /></label>
          <label className="entity-field"><span>Max length</span><input type="number" min={0} value={row.details.maxLength} onChange={(event) => onChange({ maxLength: event.target.value })} /></label>
          <label className="entity-field"><span>Pattern</span><input value={row.details.pattern} onChange={(event) => onChange({ pattern: event.target.value })} /></label>
        </>
      )}
      {(row.kind === 'number' || row.kind === 'integer') && (
        <>
          <label className="entity-field"><span>Minimum</span><input type="number" value={row.details.minimum} onChange={(event) => onChange({ minimum: event.target.value })} /></label>
          <label className="entity-field"><span>Maximum</span><input type="number" value={row.details.maximum} onChange={(event) => onChange({ maximum: event.target.value })} /></label>
        </>
      )}
      {row.kind === 'enum' && <EnumValuesEditor values={row.enumValues} onChange={onEnum} />}
      <label className="entity-field">
        <span>Default</span>
        <input value={row.details.default} onChange={(event) => onChange({ default: event.target.value })} />
      </label>
    </div>
  )
}
