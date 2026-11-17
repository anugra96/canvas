import { AlertTriangle, CheckCircle2 } from 'lucide-react'

import { type EntityFields } from '@canvas/contract'

import { useSchemaCards } from '../schema/schemaCards'
import { schemaReviewReasons } from '../schema/jsonSchema'
import { SchemaWorkbench } from './schema/SchemaWorkbench'

function fieldValue(fields: EntityFields, key: string): string {
  const value = fields[key]
  return value == null ? '' : String(value)
}

export function SchemaEditor({
  fields,
  onChange,
  api = false,
}: {
  fields: EntityFields
  onChange: (key: string, value: string) => void
  api?: boolean
}) {
  const source = fieldValue(fields, 'source')
  const schemas = useSchemaCards()
  const reviewApproved = fieldValue(fields, 'reviewStatus') === 'approved'
  const version = fieldValue(fields, 'version')
  const reviewedVersion = fieldValue(fields, 'reviewedVersion')
  const reviewReasons = schemaReviewReasons(fields, new Date())
  const reviewHealthy = reviewApproved && reviewReasons.length === 0

  return (
    <div className={`schema-workbench${api ? ' schema-workbench-full' : ''}`}>
      <SchemaWorkbench
        source={source}
        schemas={schemas}
        currentSchemaName={fieldValue(fields, 'name')}
        onChange={(value) => onChange('source', value)}
        api={api}
      />

      {!api && (
        <aside className="schema-inspector">
          <section className="schema-inspector-section">
            <h3>Contract</h3>
            <div className="schema-field-grid">
              <label className="entity-field">
                <span>Name</span>
                <input value={fieldValue(fields, 'name')} onChange={(event) => onChange('name', event.target.value)} />
              </label>
              <label className="entity-field">
                <span>Version</span>
                <input value={version} onChange={(event) => onChange('version', event.target.value)} placeholder="1.0.0" />
              </label>
              <label className="entity-field">
                <span>Owner</span>
                <input value={fieldValue(fields, 'owner')} onChange={(event) => onChange('owner', event.target.value)} />
              </label>
              <label className="entity-field">
                <span>Kind</span>
                <select value={fieldValue(fields, 'kind')} onChange={(event) => onChange('kind', event.target.value)}>
                  {['api', 'database', 'event', 'config', 'dataset', 'other'].map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="entity-field">
                <span>Status</span>
                <select value={fieldValue(fields, 'status')} onChange={(event) => onChange('status', event.target.value)}>
                  {['draft', 'active', 'deprecated'].map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="schema-inspector-section">
            <h3>Review</h3>
            <div className={`schema-review-banner ${reviewHealthy ? 'approved' : 'pending'}`}>
              {reviewHealthy ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
              {reviewHealthy ? 'Reviewed for this version' : `Review required: ${reviewReasons.join(', ')}`}
            </div>
            <div className="schema-field-grid">
              <label className="entity-field">
                <span>Review status</span>
                <select value={fieldValue(fields, 'reviewStatus')} onChange={(event) => onChange('reviewStatus', event.target.value)}>
                  {['needs_review', 'changes_requested', 'approved'].map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="entity-field">
                <span>Reviewed version</span>
                <input value={reviewedVersion} onChange={(event) => onChange('reviewedVersion', event.target.value)} placeholder="1.0.0" />
              </label>
              <label className="entity-field">
                <span>Last reviewed</span>
                <input type="date" value={fieldValue(fields, 'lastReviewed')} onChange={(event) => onChange('lastReviewed', event.target.value)} />
              </label>
              <label className="entity-field">
                <span>Interval (days)</span>
                <input type="number" min={0} value={fieldValue(fields, 'reviewIntervalDays')} onChange={(event) => onChange('reviewIntervalDays', event.target.value)} />
              </label>
            </div>
          </section>
        </aside>
      )}
    </div>
  )
}
