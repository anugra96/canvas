import { Trash2 } from 'lucide-react'
import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'

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
  draft?: boolean
  cells: Record<string, RowGridCell>
  messages?: string[]
}

export interface RowGridFocusRequest {
  row: number
  column: number
}

export interface RowGridNavigation {
  addRow: () => boolean
}

function focusCell(table: HTMLTableElement | null, target: RowGridFocusRequest): boolean {
  const cell = table?.querySelector<HTMLElement>(
    `td[data-row="${target.row}"][data-column="${target.column}"]`,
  )
  const field = cell?.querySelector<HTMLElement>('input, select, textarea')
  if (!field) return false
  field.focus()
  return true
}

export function RowGrid({
  columns,
  rows,
  onDelete,
  deleteLabel,
  emptyText,
  minWidth,
  focusRequest,
  navigation,
}: {
  columns: RowGridColumn[]
  rows: RowGridRow[]
  onDelete?: (index: number) => void
  deleteLabel?: (index: number) => string
  emptyText?: string
  minWidth?: number
  focusRequest?: RowGridFocusRequest | null
  navigation?: RowGridNavigation
}) {
  const tableRef = useRef<HTMLTableElement>(null)
  const lastFocusRequest = useRef<RowGridFocusRequest | null>(null)
  const [pendingFocus, setPendingFocus] = useState<RowGridFocusRequest | null>(null)

  useEffect(() => {
    if (!focusRequest || lastFocusRequest.current === focusRequest) return
    lastFocusRequest.current = focusRequest
    focusCell(tableRef.current, focusRequest)
  }, [focusRequest, rows.length])

  useEffect(() => {
    if (!pendingFocus) return
    if (focusCell(tableRef.current, pendingFocus)) setPendingFocus(null)
  }, [pendingFocus, rows.length])

  function handleKeyDown(event: KeyboardEvent<HTMLTableElement>): void {
    if (!navigation || event.altKey || event.ctrlKey || event.metaKey) return
    const target = event.target
    if (!(target instanceof HTMLElement)) return
    if (!target.matches('input, textarea, select')) return
    if (target instanceof HTMLInputElement && (target.type === 'checkbox' || target.type === 'radio')) {
      return
    }
    const cell = target.closest<HTMLTableCellElement>('td[data-row][data-column]')
    if (!cell) return
    const row = Number(cell.dataset.row)
    const column = Number(cell.dataset.column)
    const lastRow = rows.length - 1
    const lastColumn = columns.length - 1
    const focus = (nextRow: number, nextColumn: number) => {
      setPendingFocus({ row: nextRow, column: nextColumn })
    }
    const addRow = (nextColumn: number) => {
      if (!navigation.addRow()) return
      setPendingFocus({ row: rows.length, column: nextColumn })
    }

    switch (event.key) {
      case 'Tab':
        event.preventDefault()
        if (event.shiftKey) {
          if (column > 0) focus(row, column - 1)
          else if (row > 0) focus(row - 1, lastColumn)
        } else if (column < lastColumn) {
          focus(row, column + 1)
        } else if (row < lastRow) {
          focus(row + 1, 0)
        } else {
          addRow(0)
        }
        break
      case 'Enter':
        event.preventDefault()
        if (event.shiftKey) {
          if (row > 0) focus(row - 1, column)
        } else if (row < lastRow) {
          focus(row + 1, column)
        } else {
          addRow(column)
        }
        break
      case 'ArrowUp':
        if (row > 0) {
          event.preventDefault()
          focus(row - 1, column)
        }
        break
      case 'ArrowDown':
        if (row < lastRow) {
          event.preventDefault()
          focus(row + 1, column)
        }
        break
    }
  }

  if (columns.length === 0) {
    return <p className="schema-table-empty">{emptyText ?? 'There are no columns to show.'}</p>
  }
  return (
    <div className="schema-rows-scroll">
      <table
        ref={tableRef}
        className="schema-rows-table"
        style={minWidth ? { minWidth } : undefined}
        onKeyDown={navigation ? handleKeyDown : undefined}
      >
        <thead>
          <tr>
            <th className="schema-row-status">Row</th>
            {columns.map((column, columnIndex) => (
              <th key={columnIndex}>
                <span>{column.header}</span>
                {column.detail && <small>{column.detail}</small>}
              </th>
            ))}
            {onDelete && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <Fragment key={row.key}>
              <tr className={row.draft ? 'draft' : row.valid ? 'valid' : 'invalid'}>
                <td
                  className="schema-row-status"
                  title={row.draft ? 'Draft row' : row.valid ? 'Valid' : 'Invalid'}
                >
                  {row.draft ? row.index + 1 : `${row.valid ? '✓' : '✗'} ${row.index + 1}`}
                </td>
                {columns.map((column, columnIndex) => {
                  const cell = row.cells[column.key]
                  return (
                    <td
                      key={columnIndex}
                      data-row={rowIndex}
                      data-column={columnIndex}
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
