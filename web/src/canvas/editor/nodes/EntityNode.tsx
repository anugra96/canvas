import type { NodeProps } from '@xyflow/react'
import {
  AlertTriangle,
  Boxes,
  Code2,
  Database,
  GitBranch,
  Plug,
  Server,
  StickyNote,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import {
  entityTitle,
  findEntityType,
  type EntityTypeDefinition,
  type OntologyField,
} from '@skyward/canvas-contract'

import { useOntology } from '../../../ontology/OntologyContext'
import type { CanvasFlowNode } from '../../model/adapter'
import { useCanvasEditorActions } from '../CanvasEditorContext'
import { NodeShell } from './NodeShell'

const ICONS = {
  'alert-triangle': AlertTriangle,
  boxes: Boxes,
  code: Code2,
  database: Database,
  'git-branch': GitBranch,
  plug: Plug,
  server: Server,
  'sticky-note': StickyNote,
} as const

function TypeIcon({ name }: { name: string }) {
  const Icon = ICONS[name as keyof typeof ICONS] ?? StickyNote
  return <Icon size={16} />
}

function inputType(field: OntologyField): string {
  if (field.type === 'url') return 'url'
  if (field.type === 'number') return 'number'
  return 'text'
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: OntologyField
  value: string
  onChange: (value: string) => void
}) {
  if (field.type === 'textarea') {
    return (
      <label className="entity-field">
        <span>{field.label}</span>
        <textarea
          rows={2}
          value={value}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    )
  }

  if (field.type === 'select') {
    return (
      <label className="entity-field">
        <span>{field.label}</span>
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">—</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </label>
    )
  }

  return (
    <label className="entity-field">
      <span>{field.label}</span>
      <input
        type={inputType(field)}
        value={value}
        placeholder={field.placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function entityFields(
  entityType: EntityTypeDefinition,
  fields: Record<string, string | number | null>,
): Array<{ field: OntologyField; value: string }> {
  return entityType.fields
    .filter((field) => !field.primary)
    .map((field) => ({ field, value: fields[field.key] == null ? '' : String(fields[field.key]) }))
    .filter(({ value }) => value.trim() !== '')
}

export function EntityNode({ id, data, selected }: NodeProps<CanvasFlowNode>) {
  const actions = useCanvasEditorActions()
  const ontology = useOntology()
  const meta = data.entity
  const [editing, setEditing] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!editing) return
    function onPointerDown(event: PointerEvent) {
      if (!cardRef.current?.contains(event.target as Node)) setEditing(false)
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => window.removeEventListener('pointerdown', onPointerDown, true)
  }, [editing])

  if (!meta) {
    return (
      <NodeShell node={{ id, data, selected } as CanvasFlowNode} selected={Boolean(selected)} className="entity-node">
        <div className="asset-node-body"><span>Unknown entity</span></div>
      </NodeShell>
    )
  }

  const entityType = findEntityType(ontology, meta.entityType)
  if (!entityType) {
    return (
      <NodeShell node={{ id, data, selected } as CanvasFlowNode} selected={Boolean(selected)} className="entity-node">
        <div className="asset-node-body">
          <span>Unknown entity type: {meta.entityType}</span>
        </div>
      </NodeShell>
    )
  }

  const title = entityTitle(entityType, meta.fields)
  const rows = entityFields(entityType, meta.fields)

  return (
    <NodeShell node={{ id, data, selected } as CanvasFlowNode} selected={Boolean(selected)} className="entity-node">
      <div className="entity-card" ref={cardRef} onDoubleClick={() => setEditing(true)}>
        <header className="entity-head">
          <span className="entity-icon"><TypeIcon name={entityType.icon} /></span>
          <div>
            <span className="entity-type">{entityType.label}</span>
            <strong>{title || `Untitled ${entityType.label.toLowerCase()}`}</strong>
          </div>
          {editing && (
            <button
              className="entity-done nodrag nopan"
              onClick={(event) => {
                event.stopPropagation()
                setEditing(false)
              }}
            >
              Done
            </button>
          )}
        </header>

        {editing ? (
          <div
            className="entity-form nodrag nopan"
            onDoubleClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Escape' || (event.key === 'Enter' && (event.metaKey || event.ctrlKey))) {
                event.preventDefault()
                event.stopPropagation()
                setEditing(false)
              }
            }}
          >
            {entityType.fields.map((field) => (
              <FieldInput
                key={field.key}
                field={field}
                value={meta.fields[field.key] == null ? '' : String(meta.fields[field.key])}
                onChange={(value) => actions.updateEntityField(id, field.key, value)}
              />
            ))}
          </div>
        ) : (
          <div className="entity-body">
            {rows.length === 0 && <span className="entity-hint">Double-click to add fields</span>}
            {rows.map(({ field, value }) => (
              <div className="entity-row" key={field.key}>
                <span>{field.label}</span>
                {field.type === 'url' ? (
                  <a
                    className="nodrag"
                    href={value}
                    target="_blank"
                    rel="noreferrer noopener"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {value}
                  </a>
                ) : (
                  <strong>{value}</strong>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </NodeShell>
  )
}
