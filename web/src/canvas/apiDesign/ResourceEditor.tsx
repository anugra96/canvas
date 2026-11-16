import type { EntityFields } from '@canvas/contract'

function value(fields: EntityFields, key: string): string {
  return fields[key] == null ? '' : String(fields[key])
}

export function ResourceEditor({
  fields,
  onChange,
}: {
  fields: EntityFields
  onChange: (key: string, value: string) => void
}) {
  return (
    <div className="api-form">
      <section className="api-form-section">
        <label className="entity-field">
          <span>Name</span>
          <input value={value(fields, 'name')} onChange={(event) => onChange('name', event.target.value)} />
        </label>
        <label className="entity-field">
          <span>Description</span>
          <textarea rows={3} value={value(fields, 'description')} onChange={(event) => onChange('description', event.target.value)} />
        </label>
        <label className="entity-field">
          <span>Owner</span>
          <input value={value(fields, 'owner')} onChange={(event) => onChange('owner', event.target.value)} />
        </label>
      </section>
    </div>
  )
}
