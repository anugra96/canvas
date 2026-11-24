import { Trash2 } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'

export interface RowGridColumn {
  key: string
  header: ReactNode
  detail?: ReactNode
}

export interface RowGridCell {
  content: ReactNode
  message?: string
  inlineMessage?: ReactNode
}

export interface RowGridRow {
  key: string | number
  index: number
  valid: boolean
  cells: Record<string, RowGridCell>
  messages?: string[]
}

export function RowGrid({
  columns,
  rows,
  onDelete,
  deleteLabel,
  emptyText,
  minWidth,
}: {
  columns: RowGridColumn[]
  rows: RowGridRow[]
  onDelete?: (index: number) => void
  deleteLabel?: (index: number) => string
  emptyText?: string
  minWidth?: number
}) {
  if (columns.length === 0) {
    return <p className="schema-table-empty">{emptyText ?? 'There are no columns to show.'}</p>
  }
  return (
    <div className="schema-rows-scroll">
      <table className="schema-rows-table" style={minWidth ? { minWidth } : undefined}>
        <thead>
          <tr>
            <th className="schema-row-status">Row</th>
            {columns.map((column) => (
              <th key={column.key}>
                <span>{column.header}</span>
                {column.detail && <small>{column.detail}</small>}
              </th>
            ))}
            {onDelete && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Fragment key={row.key}>
              <tr className={row.valid ? 'valid' : 'invalid'}>
                <td className="schema-row-status" title={row.valid ? 'Valid' : 'Invalid'}>
                  {row.valid ? '✓' : '✗'} {row.index + 1}
                </td>
                {columns.map((column) => {
                  const cell = row.cells[column.key]
                  return (
                    <td
                      key={column.key}
                      className={cell?.message ? 'invalid' : ''}
                      title={cell?.message}
                    >
                      {cell?.content}
                      {cell?.inlineMessage}
                    </td>
                  )
                })}
                {onDelete && (
                  <td>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={deleteLabel ? deleteLabel(row.index) : `Delete row ${row.index + 1}`}
                      onClick={() => onDelete(row.index)}
                    >
                      <Trash2 size={12} />
                    </button>
                  </td>
                )}
              </tr>
              {!row.valid && row.messages && row.messages.length > 0 && (
                <tr className="schema-row-errors">
                  <td colSpan={columns.length + (onDelete ? 2 : 1)}>{row.messages.join(' · ')}</td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}
