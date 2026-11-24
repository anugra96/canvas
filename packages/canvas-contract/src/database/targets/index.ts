import type { DatabaseTarget } from '../../databaseTarget'
import { POSTGRES_TARGET } from './postgres'
import { SQLITE_TARGET } from './sqlite'
import type { DatabaseTargetAdapter } from './types'

export type { DatabaseTargetAdapter }

const TARGET_ADAPTERS: Partial<Record<DatabaseTarget, DatabaseTargetAdapter>> = {
  postgres: POSTGRES_TARGET,
  sqlite: SQLITE_TARGET,
}

export function databaseTargetAdapter(
  target: DatabaseTarget | undefined,
): DatabaseTargetAdapter | undefined {
  return target ? TARGET_ADAPTERS[target] : undefined
}
