import { Markdown } from '@tiptap/markdown'
import { Placeholder } from '@tiptap/extension-placeholder'
import { TaskItem } from '@tiptap/extension-task-item'
import { TableKit } from '@tiptap/extension-table'
import { TaskList } from '@tiptap/extension-task-list'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Code2, Eye } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

import {
  continueMarkdownList,
  indentMarkdownList,
  toggleInlineWrap,
  type EditResult,
} from './markdownEditing'

export interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  autoFocus?: boolean
}

export function MarkdownEditor({
  value,
  onChange,
  autoFocus = true,
}: MarkdownEditorProps) {
  const [mode, setMode] = useState<'raw' | 'preview'>('preview')
  const rawRef = useRef<HTMLTextAreaElement>(null)
  const lastEmitted = useRef(value)
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, linkOnPaste: true },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit,
      Markdown.configure({ indentation: { style: 'space', size: 2 } }),
      Placeholder.configure({ placeholder: 'Write Markdown' }),
    ],
    content: value,
    contentType: 'markdown',
    autofocus: autoFocus ? 'end' : false,
    editorProps: {
      attributes: {
        class: 'rich-editor-content',
        'aria-label': 'Markdown preview',
      },
    },
    onUpdate: ({ editor: current }) => {
      const markdown = current.getMarkdown()
      lastEmitted.current = markdown
      onChangeRef.current(markdown)
    },
  })

  useEffect(() => {
    if (!editor) return
    if (value === lastEmitted.current) return
    if (value === editor.getMarkdown()) {
      lastEmitted.current = value
      return
    }
    editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false })
    lastEmitted.current = value
  }, [editor, value])

  useEffect(() => {
    if (mode !== 'raw') return
    requestAnimationFrame(() => rawRef.current?.focus())
  }, [mode])

  function applyRawEdit(result: EditResult) {
    flushSync(() => onChange(result.text))
    const textarea = rawRef.current
    if (!textarea) return
    textarea.focus()
    textarea.setSelectionRange(result.selectionStart, result.selectionEnd)
  }

  function onRawKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    const textarea = event.currentTarget
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const modifier = event.metaKey || event.ctrlKey

    if (event.key === 'Enter' && !event.shiftKey && !event.altKey && !modifier) {
      const result = continueMarkdownList(value, start, end)
      if (result) {
        event.preventDefault()
        applyRawEdit(result)
      }
      return
    }

    if (event.key === 'Tab') {
      const result = indentMarkdownList(value, start, end, event.shiftKey)
      if (result) {
        event.preventDefault()
        applyRawEdit(result)
      }
      return
    }

    if (modifier && !event.shiftKey) {
      const key = event.key.toLowerCase()
      const marker = key === 'b' ? '**' : key === 'i' ? '*' : key === 'e' ? '`' : null
      if (marker) {
        event.preventDefault()
        applyRawEdit(toggleInlineWrap(value, start, end, marker))
      }
    }
  }

  return (
    <div className="markdown-editor">
      <div className="markdown-mode-bar" role="group" aria-label="Markdown mode">
        <button
          type="button"
          className={mode === 'raw' ? 'active' : ''}
          onClick={() => setMode('raw')}
          aria-pressed={mode === 'raw'}
        >
          <Code2 size={14} />
          Raw
        </button>
        <button
          type="button"
          className={mode === 'preview' ? 'active' : ''}
          onClick={() => {
            setMode('preview')
            requestAnimationFrame(() => editor?.commands.focus('end'))
          }}
          aria-pressed={mode === 'preview'}
        >
          <Eye size={14} />
          Preview
        </button>
        <span className="markdown-mode-hint">
          {mode === 'preview' ? 'Preview is editable. Markdown updates as you type.' : 'Plain Markdown source.'}
        </span>
      </div>

      <div className="rich-editor-wrap" hidden={mode !== 'preview'}>
        <EditorContent editor={editor} />
      </div>
      {mode === 'raw' && (
        <textarea
          ref={rawRef}
          className="node-textarea markdown-source"
          value={value}
          placeholder="Write Markdown"
          spellCheck={false}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onRawKeyDown}
        />
      )}
    </div>
  )
}
