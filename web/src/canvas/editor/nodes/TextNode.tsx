import type { NodeProps } from '@xyflow/react'
import { useState } from 'react'

import type { CanvasFlowNode } from '../../model/adapter'
import { useIsMobile } from '../../../useMediaQuery'
import { useCanvasEditorActions } from '../CanvasEditorContext'
import { FocusEditor } from '../FocusEditor'
import { MarkdownContent } from '../MarkdownContent'
import { MarkdownEditor } from '../MarkdownEditorLazy'
import { NodeShell } from './NodeShell'

export function TextNode({ id, data, selected }: NodeProps<CanvasFlowNode>) {
  const actions = useCanvasEditorActions()
  const isMobile = useIsMobile()
  const [editing, setEditing] = useState(false)

  function startEditing() {
    setEditing(true)
  }

  function commit() {
    setEditing(false)
  }

  const title = (data.text ?? '')
    .split('\n')
    .find((line) => line.trim() && !line.trim().startsWith('|'))
    ?.replace(/^#+\s*/, '')
    .slice(0, 80) || 'Text card'

  return (
    <NodeShell node={{ id, data, selected } as CanvasFlowNode} selected={Boolean(selected)} className="text-node">
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
          : <span className="node-placeholder">{isMobile ? 'Double-tap to write' : 'Double-click to write'}</span>}
      </div>
      {editing && (
        <FocusEditor label="Edit text card" title={title} onClose={commit}>
          <MarkdownEditor
            value={data.text ?? ''}
            onChange={(text) => actions.updateText(id, text)}
          />
        </FocusEditor>
      )}
    </NodeShell>
  )
}
