import { Markdown } from '@tiptap/markdown'
import { Placeholder } from '@tiptap/extension-placeholder'
import { TaskItem } from '@tiptap/extension-task-item'
import { TableKit } from '@tiptap/extension-table'
import { TaskList } from '@tiptap/extension-task-list'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  Bold,
  Code,
  Code2,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  Redo2,
  Strikethrough,
  Table2,
  Underline,
  Undo2,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'

import {
  continueMarkdownList,
  indentMarkdownList,
  toggleInlineWrap,
  type EditResult,
} from './markdownEditing'

export function MarkdownEditor({
  value,
  onChange,
  autoFocus = true,
}: {
  value: string
  onChange: (value: string) => void
  autoFocus?: boolean
}) {
  const [mode, setMode] = useState<'rich' | 'raw'>('rich')
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
      Placeholder.configure({ placeholder: 'Write a note' }),
    ],
    content: value,
    contentType: 'markdown',
    autofocus: autoFocus ? 'end' : false,
    editorProps: {
      attributes: { class: 'rich-editor-content' },
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

  const active = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive('bold'),
      italic: current.isActive('italic'),
      underline: current.isActive('underline'),
      strike: current.isActive('strike'),
      code: current.isActive('code'),
      bulletList: current.isActive('bulletList'),
      orderedList: current.isActive('orderedList'),
      taskList: current.isActive('taskList'),
      blockquote: current.isActive('blockquote'),
      heading2: current.isActive('heading', { level: 2 }),
      inTable: current.isActive('table'),
      canUndo: current.can().undo(),
      canRedo: current.can().redo(),
    }),
  })

  function applyRawEdit(result: EditResult) {
    flushSync(() => onChange(result.text))
    const textarea = rawRef.current
    if (!textarea) return
    textarea.focus()
    textarea.setSelectionRange(result.selectionStart, result.selectionEnd)
  }

  function switchMode() {
    if (mode === 'rich') {
      setMode('raw')
      requestAnimationFrame(() => {
        const textarea = rawRef.current
        textarea?.focus()
        textarea?.setSelectionRange(textarea.value.length, textarea.value.length)
      })
      return
    }
    setMode('rich')
    requestAnimationFrame(() => editor?.commands.focus('end'))
  }

  function setLink() {
    const href = window.prompt('Link URL')
    if (!href) return
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
  }

  return (
    <div className="markdown-editor">
      <div className="rich-toolbar">
        <button
          type="button"
          className="rich-tool rich-mode-toggle"
          onClick={switchMode}
          title={mode === 'rich' ? 'Edit Markdown source' : 'Return to rich text'}
        >
          {mode === 'rich' ? 'Markdown' : 'Rich text'}
        </button>
        {mode === 'rich' && (
          <>
            <span className="rich-tool-sep" />
            <ToolButton label="Bold" active={active?.bold} onClick={() => editor.chain().focus().toggleBold().run()}>
              <Bold size={14} />
            </ToolButton>
            <ToolButton label="Italic" active={active?.italic} onClick={() => editor.chain().focus().toggleItalic().run()}>
              <Italic size={14} />
            </ToolButton>
            <ToolButton label="Underline" active={active?.underline} onClick={() => editor.chain().focus().toggleUnderline().run()}>
              <Underline size={14} />
            </ToolButton>
            <ToolButton label="Strikethrough" active={active?.strike} onClick={() => editor.chain().focus().toggleStrike().run()}>
              <Strikethrough size={14} />
            </ToolButton>
            <ToolButton label="Inline code" active={active?.code} onClick={() => editor.chain().focus().toggleCode().run()}>
              <Code size={14} />
            </ToolButton>
            <span className="rich-tool-sep" />
            <ToolButton label="Heading" active={active?.heading2} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
              <Heading2 size={14} />
            </ToolButton>
            <ToolButton label="Bulleted list" active={active?.bulletList} onClick={() => editor.chain().focus().toggleBulletList().run()}>
              <List size={14} />
            </ToolButton>
            <ToolButton label="Numbered list" active={active?.orderedList} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
              <ListOrdered size={14} />
            </ToolButton>
            <ToolButton label="Task list" active={active?.taskList} onClick={() => editor.chain().focus().toggleTaskList().run()}>
              <ListTodo size={14} />
            </ToolButton>
            <ToolButton label="Quote" active={active?.blockquote} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
              <Quote size={14} />
            </ToolButton>
            <ToolButton label="Code block" onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
              <Code2 size={14} />
            </ToolButton>
            <ToolButton label="Link" onClick={setLink}>
              <Link2 size={14} />
            </ToolButton>
            <ToolButton
              label="Table"
              onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
            >
              <Table2 size={14} />
            </ToolButton>
            <span className="rich-tool-sep" />
            <ToolButton label="Undo" disabled={!active?.canUndo} onClick={() => editor.chain().focus().undo().run()}>
              <Undo2 size={14} />
            </ToolButton>
            <ToolButton label="Redo" disabled={!active?.canRedo} onClick={() => editor.chain().focus().redo().run()}>
              <Redo2 size={14} />
            </ToolButton>
          </>
        )}
      </div>
      {mode === 'rich' && active?.inTable && (
        <div className="rich-table-bar">
          <span className="rich-table-label">Table</span>
          <ToolButton label="Add row" onClick={() => editor.chain().focus().addRowAfter().run()}>+ Row</ToolButton>
          <ToolButton label="Add column" onClick={() => editor.chain().focus().addColumnAfter().run()}>+ Column</ToolButton>
          <span className="rich-tool-sep" />
          <ToolButton label="Delete row" onClick={() => editor.chain().focus().deleteRow().run()}>Delete row</ToolButton>
          <ToolButton label="Delete column" onClick={() => editor.chain().focus().deleteColumn().run()}>Delete column</ToolButton>
          <span className="rich-tool-sep" />
          <ToolButton label="Toggle header row" onClick={() => editor.chain().focus().toggleHeaderRow().run()}>Header</ToolButton>
          <ToolButton label="Delete table" onClick={() => editor.chain().focus().deleteTable().run()}>Delete table</ToolButton>
        </div>
      )}
      <div className="rich-editor-wrap" hidden={mode !== 'rich'}>
        <EditorContent editor={editor} />
      </div>
      {mode === 'raw' && (
        <textarea
          ref={rawRef}
          className="node-textarea nodrag nopan"
          value={value}
          onChange={(event) => {
            onChange(event.target.value)
          }}
          onKeyDown={(event) => {
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
          }}
          placeholder="Write a note"
        />
      )}
    </div>
  )
}

function ToolButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={`rich-tool${active ? ' active' : ''}`}
      disabled={disabled}
      aria-label={label}
      title={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
