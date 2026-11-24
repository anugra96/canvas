import type { DatabaseTarget } from '../../databaseTarget'

export interface DatabaseTargetAdapter {
  typeFor: (columnType: string) => string
}

const POSTGRES_TARGET: DatabaseTargetAdapter = {
  typeFor(columnType) {
    switch (columnType.trim().toLowerCase()) {
      case 'timestamp':
        return 'timestamp with time zone'
      case 'binary':
        return 'bytea'
      default:
        return columnType
    }
  },
}

const TARGET_ADAPTERS: Partial<Record<DatabaseTarget, DatabaseTargetAdapter>> = {
  postgres: POSTGRES_TARGET,
}

export function databaseTargetAdapter(
  target: DatabaseTarget | undefined,
): DatabaseTargetAdapter | undefined {
  return target ? TARGET_ADAPTERS[target] : undefined
}
