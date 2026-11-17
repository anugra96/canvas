import { importDatabaseSql, type DatabaseImportResult } from '@canvas/contract/database-import'

export async function importDatabaseFromSql(sql: string): Promise<DatabaseImportResult> {
  const response = await fetch('/libpg-query.wasm')
  if (!response.ok) throw new Error('Could not load the PostgreSQL parser.')
  const wasm = await response.arrayBuffer()
  return importDatabaseSql(sql, { wasm })
}
