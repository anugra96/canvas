import { Boxes, ListTree } from 'lucide-react'

export function DatabaseSchemaCardPreview({
  fields,
}: {
  fields: Record<string, string | number | null>
}) {
  return (
    <div className="entity-card db-schema-card">
      <header className="db-schema-head">
        <span className="db-schema-icon"><Boxes size={16} /></span>
        <div>
          <span className="entity-type">Schema</span>
          <strong>{String(fields.name ?? '') || 'Untitled schema'}</strong>
        </div>
      </header>
      {String(fields.description ?? '').trim() && (
        <p className="db-schema-description">{String(fields.description)}</p>
      )}
    </div>
  )
}

export function DatabaseEnumCardPreview({
  fields,
}: {
  fields: Record<string, string | number | null>
}) {
  const values = String(fields.values ?? '')
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean)
  return (
    <div className="entity-card db-enum-card">
      <header className="db-enum-head">
        <span className="db-enum-icon"><ListTree size={15} /></span>
        <div>
          <span className="db-table-schema">{String(fields.schema ?? 'public')}</span>
          <strong>{String(fields.name ?? '') || 'Untitled enum'}</strong>
        </div>
      </header>
      <div className="db-enum-values">
        {values.slice(0, 8).map((value) => <span key={value} className="db-enum-value">{value}</span>)}
        {values.length > 8 && <span className="db-enum-value">+{values.length - 8} more</span>}
      </div>
    </div>
  )
}
