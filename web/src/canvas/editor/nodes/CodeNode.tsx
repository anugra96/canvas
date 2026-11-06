import type { NodeProps } from '@xyflow/react'
import { Code2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import {
  entityTitle,
  findEntityType,
} from '@skyward/canvas-contract'

import { useOntology } from '../../../ontology/OntologyContext'
import type { CanvasFlowNode } from '../../model/adapter'
import { CodeBlock } from '../CodeBlock'
import { CODE_LANGUAGES } from '../codeLanguages'
import { useCanvasEditorActions } from '../CanvasEditorContext'
import { NodeShell } from './NodeShell'

export function CodeNode({ id, data, selected }: NodeProps<CanvasFlowNode>) {
  const actions = useCanvasEditorActions()
  const ontology = useOntology()
  const meta = data.entity
  const entityType = meta ? findEntityType(ontology, meta.entityType) : undefined
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

  if (!meta || !entityType) {
    return (
      <NodeShell node={{ id, data, selected } as CanvasFlowNode} selected={Boolean(selected)} className="code-node">
        <div className="asset-node-body"><span>Unknown code card</span></div>
      </NodeShell>
    )
  }

  const fieldValue = (key: string): string => {
    const value = meta.fields[key]
    return value == null ? '' : String(value)
  }

  const title = entityTitle(entityType, meta.fields)
  const language = fieldValue('language') || 'typescript'
  const code = fieldValue('code')
  const notes = fieldValue('notes')

  return (
    <NodeShell node={{ id, data, selected } as CanvasFlowNode} selected={Boolean(selected)} className="code-node">
      <div className="code-card" ref={cardRef} onDoubleClick={() => setEditing(true)}>
        <header className="code-head">
          <span className="entity-icon"><Code2 size={16} /></span>
          <div>
            <span className="entity-type">Code</span>
            <strong>{title || 'Untitled code sample'}</strong>
          </div>
          <span className="code-language">{language}</span>
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
            className="code-form nodrag nopan"
            onDoubleClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Escape' || (event.key === 'Enter' && (event.metaKey || event.ctrlKey))) {
                event.preventDefault()
                event.stopPropagation()
                setEditing(false)
              }
            }}
          >
            <label className="entity-field">
              <span>Title</span>
              <input
                value={title}
                placeholder="What this code does"
                onChange={(event) => actions.updateEntityField(id, 'title', event.target.value)}
              />
            </label>
            <label className="entity-field">
              <span>Language</span>
              <select
                value={language}
                onChange={(event) => actions.updateEntityField(id, 'language', event.target.value)}
              >
                {CODE_LANGUAGES.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
            <label className="entity-field code-field">
              <span>Code</span>
              <textarea
                className="code-input"
                value={code}
                placeholder="Paste a code sample"
                spellCheck={false}
                onChange={(event) => actions.updateEntityField(id, 'code', event.target.value)}
              />
            </label>
            <label className="entity-field">
              <span>Notes</span>
              <textarea
                rows={2}
                value={notes}
                onChange={(event) => actions.updateEntityField(id, 'notes', event.target.value)}
              />
            </label>
          </div>
        ) : (
          <>
            <div className="code-body">
              <CodeBlock code={code} language={language} />
            </div>
            {notes && <div className="code-notes">{notes}</div>}
          </>
        )}
      </div>
    </NodeShell>
  )
}
