import type { ParseResult } from 'libpg-query'

export interface DatabaseParser {
  parse: (sql: string) => Promise<ParseResult>
  deparse: (node: unknown) => string | undefined
}

export async function loadDatabaseParser(
  wasm?: ArrayBuffer | ArrayBufferView,
): Promise<DatabaseParser> {
  const [libpg, deparser] = await Promise.all([
    import('libpg-query'),
    import('pgsql-deparser'),
  ])
  if (wasm) await libpg.loadModule({ wasm })
  return {
    parse: (sql: string) => libpg.parse(sql),
    deparse: (node: unknown) => {
      try {
        return deparser.deparseSync(node as never)
      } catch {
        return undefined
      }
    },
  }
}
