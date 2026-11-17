import type { OntologyField } from '@canvas/contract'

function inputType(field: OntologyField): string {
  if (field.type === 'url') return 'url'
  if (field.type === 'number') return 'number'
  return 'text'
}

export function FieldInput({
  field,
  value,
  onChange,
  className,
  rows = 2,
  readOnly = false,
}: {
  field: OntologyField
  value: string
  onChange: (value: string) => void
  className?: string
  rows?: number
  readOnly?: boolean
}) {
  const labelClassName = `entity-field${className ? ` ${className}` : ''}`

  if (field.type === 'textarea') {
    return (
      <label className={labelClassName}>
        <span>{field.label}</span>
        <textarea
          rows={rows}
          data-field-key={field.key}
          value={value}
          placeholder={field.placeholder}
          readOnly={readOnly}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    )
  }

  if (field.type === 'select') {
    return (
      <label className={labelClassName}>
        <span>{field.label}</span>
        <select
          data-field-key={field.key}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">—</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </label>
    )
  }

  return (
    <label className={labelClassName}>
      <span>{field.label}</span>
      <input
        type={inputType(field)}
        data-field-key={field.key}
        value={value}
        placeholder={field.placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}
