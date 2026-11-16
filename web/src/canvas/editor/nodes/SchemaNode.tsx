import type { NodeProps } from '@xyflow/react'
import {
  AlertCircle,
  AlertTriangle,
  Braces,
  CheckCircle2,
} from 'lucide-react'
import { useMemo, useState } from 'react'

import { entityTitle, findEntityType } from '@canvas/contract'

import { useOntology } from '../../../ontology/OntologyContext'
import type { CanvasFlowNode } from '../../model/adapter'
import { analyzeJsonSchema, schemaReviewReasons } from '../../schema/jsonSchema'
import { useCanvasEditorActions } from '../CanvasEditorContext'
import { FocusEditor } from '../FocusEditor'
import { SchemaEditor } from '../SchemaEditor'
import { useApiDesign } from '../../apiDesign/ApiDesignContext'
import { NodeShell } from './NodeShell'

function fieldValue(fields: Record<string, string | number | null>, key: string): string {
  const value = fields[key]
  return value == null ? '' : String(value)
}

export function SchemaNode({ id, data, selected }: NodeProps<CanvasFlowNode>) {
  const actions = useCanvasEditorActions()
  const ontology = useOntology()
  const [editing, setEditing] = useState(false)
  const apiDesign = useApiDesign()
  const meta = data.entity
  const entityType = meta ? findEntityType(ontology, meta.entityType) : undefined
  const source = meta ? fieldValue(meta.fields, 'source') : ''
  const analysis = useMemo(
    () => analyzeJsonSchema(source, apiDesign ? { assumedDialect: '2020-12' } : {}),
    [apiDesign, source],
  )

  if (!meta || !entityType) {
    return (
      <NodeShell node={{ id, data, selected } as CanvasFlowNode} selected={Boolean(selected)} className="schema-node">
        <div className="asset-node-body"><span>Unknown schema card</span></div>
      </NodeShell>
    )
  }

  const name = entityTitle(entityType, meta.fields) || 'Untitled Schema'
  const version = fieldValue(meta.fields, 'version')
  const kind = fieldValue(meta.fields, 'kind')
  const owner = fieldValue(meta.fields, 'owner')
  const status = fieldValue(meta.fields, 'status')
  const reviewReasons = schemaReviewReasons(meta.fields, new Date())
  const reviewHealthy = reviewReasons.length === 0
  const preview = source.split('\n').slice(0, 7).join('\n')
  const fields = analysis.outline[0]?.children ?? []
  const firstError = analysis.diagnostics.find((diagnostic) => diagnostic.severity === 'error')

  function startEditing() {
    setEditing(true)
  }

  return (
    <NodeShell node={{ id, data, selected } as CanvasFlowNode} selected={Boolean(selected)} className="schema-node" onEdit={startEditing}>
      <div className="schema-card" onDoubleClick={startEditing}>
        <header className="schema-head">
          <span className="schema-icon"><Braces size={17} /></span>
          <div>
            <span className="entity-type">{apiDesign ? 'JSON Schema' : `JSON Schema · ${kind || 'contract'}`}</span>
            <strong>{name}</strong>
          </div>
          {!apiDesign && <span className="schema-version">{version ? `v${version}` : 'unversioned'}</span>}
        </header>
        <div className="schema-body">
          <div className="schema-health-row">
            <span className={`schema-health ${analysis.valid ? 'valid' : 'invalid'}`}>
              {analysis.valid ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
              {analysis.valid ? 'Valid schema' : 'Invalid schema'}
            </span>
            {!apiDesign && (
              <span className={`schema-health ${reviewHealthy ? 'valid' : 'pending'}`}>
                {reviewHealthy ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                {reviewHealthy ? 'Reviewed' : 'Review required'}
              </span>
            )}
            {!apiDesign && (
              <span className={`schema-health ${status === 'active' ? 'valid' : 'pending'}`}>{status || 'draft'}</span>
            )}
          </div>
          {firstError && (
            <p className="schema-card-error">{firstError.message}</p>
          )}
          {fields.length > 0 ? (
            <div className="schema-field-list">
              {fields.slice(0, 8).map((field) => (
                <span className={`schema-field ${field.required ? 'required' : ''}`} key={field.name}>
                  {field.name}
                  <em>{field.type}</em>
                </span>
              ))}
              {fields.length > 8 && <span className="schema-field more">+{fields.length - 8}</span>}
            </div>
          ) : preview ? (
            <pre className="schema-preview">{preview}{source.split('\n').length > 7 ? '\n…' : ''}</pre>
          ) : (
            <p className="schema-empty">Double-tap to paste a JSON Schema contract.</p>
          )}
          <div className="schema-card-meta">
            {!apiDesign && <span>{owner || 'No owner'}</span>}
            <span>{fields.length} root fields</span>
          </div>
        </div>
      </div>
      {editing && (
        <FocusEditor label="Edit schema contract" title={name} onClose={() => setEditing(false)}>
          <SchemaEditor
            fields={meta.fields}
            api={Boolean(apiDesign)}
            onChange={(key, value) => actions.updateEntityField(id, key, value)}
          />
        </FocusEditor>
      )}
    </NodeShell>
  )
}
