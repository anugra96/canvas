import type { NodeProps } from '@xyflow/react'
import { ChevronDown, ChevronRight, Code2 } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

import {
  entityTitle,
  findEntityType,
} from '@canvas/contract'

import { useOntology } from '../../../ontology/OntologyContext'
import type { CanvasFlowNode } from '../../model/adapter'
import { CodeBlock } from '../CodeBlock'
import { CODE_LANGUAGES } from '../codeLanguages'
import {
  autoClosePair,
  indentCode,
  lineCommentToken,
  skipClosingChar,
  smartBackspace,
  smartEnter,
  toggleLineComment,
  type CodeEditResult,
} from '../codeEditing'
import { useCanvasEditorActions } from '../CanvasEditorContext'
import { FocusEditor } from '../FocusEditor'
import { MarkdownEditor } from '../MarkdownEditor'
import { NodeShell } from './NodeShell'

export function CodeNode({ id, data, selected }: NodeProps<CanvasFlowNode>) {
  const actions = useCanvasEditorActions()
  const ontology = useOntology()
  const meta = data.entity
  const entityType = meta ? findEntityType(ontology, meta.entityType) : undefined
  const [editing, setEditing] = useState(false)
  const [propertiesOpen, setPropertiesOpen] = useState(false)
  const codeInputRef = useRef<HTMLTextAreaElement>(null)
  const pendingSelection = useRef<{ start: number; end: number } | null>(null)

  useEffect(() => {
    if (!editing) return
    const textarea = codeInputRef.current
    if (!textarea) return
    textarea.scrollIntoView({ block: 'nearest' })
    textarea.focus()
    textarea.setSelectionRange(textarea.value.length, textarea.value.length)
  }, [editing])

  useLayoutEffect(() => {
    const selection = pendingSelection.current
    if (!selection) return
    pendingSelection.current = null
    const textarea = codeInputRef.current
    if (!textarea) return
    textarea.focus()
    textarea.setSelectionRange(selection.start, selection.end)
  }, [data.entity?.fields.code])

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

  function startEditing() {
    setPropertiesOpen(false)
    setEditing(true)
  }

  function applyCodeEdit(result: CodeEditResult) {
    pendingSelection.current = { start: result.selectionStart, end: result.selectionEnd }
    flushSync(() => actions.updateEntityField(id, 'code', result.text))
    const selection = pendingSelection.current
    if (!selection) return
    pendingSelection.current = null
    const textarea = codeInputRef.current
    if (!textarea) return
    textarea.focus()
    textarea.setSelectionRange(selection.start, selection.end)
  }

  const editorForm = (
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
      <section className="property-drawer">
        <button
          type="button"
          className="property-drawer-toggle nodrag nopan"
          aria-expanded={propertiesOpen}
          onClick={() => setPropertiesOpen((open) => !open)}
        >
          {propertiesOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          Properties
          <span>2</span>
        </button>
        {propertiesOpen && (
          <div className="property-drawer-body">
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
          </div>
        )}
      </section>

      <label className="entity-field code-field">
        <span>Code</span>
        <textarea
          ref={codeInputRef}
          className="code-input"
          value={code}
          placeholder="Paste a code sample"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          onChange={(event) => {
            const textarea = event.currentTarget
            pendingSelection.current = {
              start: textarea.selectionStart,
              end: textarea.selectionEnd,
            }
            const next = textarea.value
            flushSync(() => actions.updateEntityField(id, 'code', next))
          }}
          onKeyDown={(event) => {
            const textarea = event.currentTarget
            const start = textarea.selectionStart
            const end = textarea.selectionEnd
            const modifier = event.metaKey || event.ctrlKey

            if (event.key === 'Escape' || (event.key === 'Enter' && modifier)) {
              event.preventDefault()
              event.stopPropagation()
              setEditing(false)
              return
            }

            if (event.key === 'Tab') {
              event.preventDefault()
              event.stopPropagation()
              const result = indentCode(code, start, end, event.shiftKey)
              if (result) applyCodeEdit(result)
              return
            }

            if (event.key === 'Enter' && !event.shiftKey && !event.altKey && !modifier) {
              event.preventDefault()
              event.stopPropagation()
              applyCodeEdit(smartEnter(code, start, end))
              return
            }

            if (event.key === 'Backspace') {
              const result = smartBackspace(code, start, end)
              if (result) {
                event.preventDefault()
                event.stopPropagation()
                applyCodeEdit(result)
              }
              return
            }

            if (modifier && event.key === '/') {
              const token = lineCommentToken(language)
              if (token) {
                event.preventDefault()
                event.stopPropagation()
                applyCodeEdit(toggleLineComment(code, start, end, token))
              }
              return
            }

            const pairs: Record<string, string> = {
              '(': ')',
              '[': ']',
              '{': '}',
              '"': '"',
              "'": "'",
              '`': '`',
            }
            const closing = pairs[event.key]
            if (!modifier && !event.altKey && closing) {
              event.preventDefault()
              event.stopPropagation()
              const skipped = skipClosingChar(code, start, end, event.key)
              if (skipped) applyCodeEdit(skipped)
              else applyCodeEdit(autoClosePair(code, start, end, event.key, closing))
              return
            }

            if (!modifier && !event.altKey && [')', ']', '}', '"', "'", '`'].includes(event.key)) {
              const skipped = skipClosingChar(code, start, end, event.key)
              if (skipped) {
                event.preventDefault()
                event.stopPropagation()
                applyCodeEdit(skipped)
              }
            }
          }}
        />
      </label>

      <div className="entity-field code-notes-field">
        <span>Notes</span>
        <MarkdownEditor
          value={notes}
          onChange={(value) => actions.updateEntityField(id, 'notes', value)}
          autoFocus={false}
        />
      </div>
    </div>
  )

  return (
    <NodeShell node={{ id, data, selected } as CanvasFlowNode} selected={Boolean(selected)} className="code-node">
      <div
        className="code-card"
        onDoubleClick={() => {
          if (!editing) startEditing()
        }}
      >
        <header className="code-head">
          <span className="entity-icon"><Code2 size={16} /></span>
          <div>
            <span className="entity-type">Code</span>
            <strong>{title || 'Untitled code sample'}</strong>
          </div>
          <span className="code-language">{language}</span>
        </header>
        <div className="code-body">
          <CodeBlock code={code} language={language} />
        </div>
        {notes && <div className="code-notes">{notes}</div>}
      </div>
      {editing && (
        <FocusEditor
          label="Edit code card"
          title={title || 'Untitled code sample'}
          onClose={() => setEditing(false)}
        >
          {editorForm}
        </FocusEditor>
      )}
    </NodeShell>
  )
}
