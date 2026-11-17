import { Handle, Position } from '@xyflow/react'
import { KeyRound, Table2 } from 'lucide-react'

import {
  databaseColumnHandleId,
  parseTableDefinition,
  type TableColumn,
  type TableDefinition,
} from '@canvas/contract'

const VISIBLE_COLUMNS = 12

function badges(definition: TableDefinition, column: TableColumn): string[] {
  const result: string[] = []
  if (definition.primaryKey?.columns.includes(column.name)) result.push('PK')
  if (definition.foreignKeys.some((foreignKey) => foreignKey.columns.includes(column.name))) result.push('FK')
  if (definition.uniques.some((unique) => unique.columns.includes(column.name))) result.push('UQ')
  if (column.nullable) result.push('NULL')
  if (definition.indexes.some((index) => index.columns[0] === column.name)) result.push('IDX')
  return result
}

export function TableCardPreview({
  fields,
}: {
  fields: Record<string, string | number | null>
}) {
  const name = String(fields.name ?? '')
  const schema = String(fields.schema ?? 'public')
  const definition = parseTableDefinition(fields.definition)
  const columns = definition?.columns ?? []
  const visible = columns.slice(0, VISIBLE_COLUMNS)
  const hidden = Math.max(0, columns.length - visible.length)

  return (
    <div className="entity-card db-table-card">
      <header className="db-table-head">
        <span className="db-table-icon"><Table2 size={15} /></span>
        <div>
          <span className="db-table-schema">{schema}</span>
          <strong>{name || 'Untitled table'}</strong>
        </div>
        <span className="db-table-count">{columns.length}</span>
      </header>
      <div className="db-table-columns">
        {visible.length === 0 && (
          <span className="entity-hint">Double-click to add columns.</span>
        )}
        {visible.map((column) => (
          <div className="db-column-row" key={column.name}>
            <Handle
              type="target"
              position={Position.Left}
              id={databaseColumnHandleId(column.name, 'left')}
              className="db-column-handle left"
            />
            <Handle
              type="source"
              position={Position.Left}
              id={databaseColumnHandleId(column.name, 'left')}
              className="db-column-handle left db-column-handle-ghost"
              isConnectable={false}
            />
            <span className="db-column-name">
              {definition?.primaryKey?.columns.includes(column.name) && <KeyRound size={10} />}
              {column.name}
            </span>
            <span className="db-column-type">{column.type}</span>
            <span className="db-column-badges">
              {badges(definition!, column).map((badge) => (
                <span key={badge} className={`db-badge db-badge-${badge.toLowerCase()}`}>{badge}</span>
              ))}
            </span>
            <Handle
              type="source"
              position={Position.Right}
              id={databaseColumnHandleId(column.name, 'right')}
              className="db-column-handle right"
            />
            <Handle
              type="target"
              position={Position.Right}
              id={databaseColumnHandleId(column.name, 'right')}
              className="db-column-handle right db-column-handle-ghost"
              isConnectable={false}
            />
          </div>
        ))}
        {hidden > 0 && <div className="db-column-more">+{hidden} more</div>}
      </div>
    </div>
  )
}
