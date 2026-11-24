export interface DatabaseTargetAdapter {
  typeFor: (columnType: string) => string
}
