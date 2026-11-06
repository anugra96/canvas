import type { NodeProps } from '@xyflow/react'
import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

import type { CanvasFlowNode } from '../../model/adapter'
import { useCanvasEditorActions } from '../CanvasEditorContext'
import {
  continueMarkdownList,
  indentMarkdownList,
  toggleInlineWrap,
  type EditResult,
} from '../markdownEditing'
import { MarkdownContent } from '../MarkdownContent'
import { NodeShell } from './NodeShell'

export function TextNode({ id, data, selected }: NodeProps<CanvasFlowNode>) {
  const actions = useCanvasEditorActions()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(data.text ?? '')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!editing) return
    const textarea = textareaRef.current
    textarea?.focus()
    textarea?.setSelectionRange(textarea.value.length, textarea.value.length)
  }, [editing])

  useEffect(() => {
    if (!editing) return
    function onPointerDown(event: PointerEvent) {
      if (!textareaRef.current?.contains(event.target as Node)) setEditing(false)
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => window.removeEventListener('pointerdown', onPointerDown, true)
  }, [editing])

  function startEditing() {
    setValue(data.text ?? '')
    setEditing(true)
  }

  function commit() {
    setEditing(false)
  }

  function applyEdit(result: EditResult) {
    flushSync(() => {
      setValue(result.text)
      actions.updateText(id, result.text)
    })
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.focus()
    textarea.setSelectionRange(result.selectionStart, result.selectionEnd)
  }

  return (
    <NodeShell node={{ id, data, selected } as CanvasFlowNode} selected={Boolean(selected)} className="text-node">
      {editing ? (
        <textarea
          ref={textareaRef}
          className="node-textarea nodrag nopan"
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            actions.updateText(id, event.target.value)
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            const textarea = event.currentTarget
            const start = textarea.selectionStart
            const end = textarea.selectionEnd
            const modifier = event.metaKey || event.ctrlKey

            if (event.key === 'Escape' || (event.key === 'Enter' && modifier)) {
              event.preventDefault()
              event.stopPropagation()
              commit()
              return
            }

            if (event.key === 'Enter' && !event.shiftKey && !event.altKey && !modifier) {
              const result = continueMarkdownList(value, start, end)
              if (result) {
                event.preventDefault()
                applyEdit(result)
              }
              return
            }

            if (event.key === 'Tab') {
              const result = indentMarkdownList(value, start, end, event.shiftKey)
              if (result) {
                event.preventDefault()
                applyEdit(result)
              }
              return
            }

            if (modifier && !event.shiftKey) {
              const key = event.key.toLowerCase()
              const marker = key === 'b' ? '**' : key === 'i' ? '*' : key === 'e' ? '`' : null
              if (marker) {
                event.preventDefault()
                applyEdit(toggleInlineWrap(value, start, end, marker))
              }
            }
          }}
          placeholder="Write a note"
        />
      ) : (
        <div
          className="node-text"
          onDoubleClick={startEditing}
          role="group"
          tabIndex={0}
          aria-label="Canvas text card"
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey) {
              event.preventDefault()
              startEditing()
            }
          }}
        >
          {data.text
            ? <MarkdownContent text={data.text} />
            : <span className="node-placeholder">Double-click to write</span>}
        </div>
      )}
    </NodeShell>
  )
}
