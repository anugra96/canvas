import type { TableColumn, TableRow, TableRowValidation } from '@canvas/contract'

export function isDraftTableRow(row: TableRow, columns: TableColumn[]): boolean {
  return columns.every((column) => {
    const value = row[column.name]
    return value == null || value.trim() === ''
  })
}

export function savedTableRows(rows: TableRow[], columns: TableColumn[]): TableRow[] {
  return rows.filter((row) => !isDraftTableRow(row, columns))
}

export interface TableRowsSummary {
  drafts: boolean[]
  validCount: number
  countedRows: number
}

export function tableRowsSummary(
  rows: TableRow[],
  columns: TableColumn[],
  validation: TableRowValidation,
): TableRowsSummary {
  const drafts = rows.map((row) => isDraftTableRow(row, columns))
  return {
    drafts,
    validCount: validation.rows.filter((row, index) => !drafts[index] && row.valid).length,
    countedRows: drafts.filter((draft) => !draft).length,
  }
}
