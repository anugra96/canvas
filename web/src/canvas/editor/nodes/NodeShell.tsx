import { Handle, NodeResizer, Position } from '@xyflow/react'
import type { ReactNode } from 'react'

import { cardBackgroundFor, colorFor, groupBackgroundFor, type CanvasFlowNode } from '../../model/adapter'
import { useCanvasEditorActions } from '../CanvasEditorContext'

const SIDES = [
  { id: 'top', position: Position.Top },
  { id: 'right', position: Position.Right },
  { id: 'bottom', position: Position.Bottom },
  { id: 'left', position: Position.Left },
] as const

interface NodeShellProps {
  node: CanvasFlowNode
  selected: boolean
  className: string
  children: ReactNode
}

export function NodeShell({ node, selected, className, children }: NodeShellProps) {
  const actions = useCanvasEditorActions()
  const accent = colorFor(node.data.raw.color)
  const background = node.data.raw.type === 'group'
    ? groupBackgroundFor(node.data.raw.color)
    : cardBackgroundFor(node.data.raw.color)

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={160}
        minHeight={80}
        lineClassName="canvas-resize-line"
        handleClassName="canvas-resize-handle"
        onResizeEnd={(_, params) => actions.resizeNode(node.id, params.width, params.height)}
      />
      {SIDES.map((side) => (
        <Handle
          key={side.id}
          id={side.id}
          type="source"
          position={side.position}
          className="canvas-handle"
        />
      ))}
      <div
        className={`canvas-node ${className}${selected ? ' selected' : ''}`}
        style={accent || background ? { borderColor: accent, background } : undefined}
      >
        {children}
      </div>
    </>
  )
}
