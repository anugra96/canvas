import type { DatabaseTargetAdapter } from './types'

export const POSTGRES_TARGET: DatabaseTargetAdapter = {
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
