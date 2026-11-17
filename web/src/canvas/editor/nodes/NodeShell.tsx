import { Handle, NodeResizer, Position } from '@xyflow/react'
import { AlertCircle, AlertTriangle, Link2 } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'

import { getCanvasLinks } from '@canvas/contract'

import { colorFor, groupBackgroundFor, type CanvasFlowNode } from '../../model/adapter'
import { useCanvasEditorActions } from '../CanvasEditorContext'
import { useCanvasValidation } from '../CanvasValidationContext'

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
  onEdit?: () => void
}

export function NodeShell({ node, selected, className, children, onEdit }: NodeShellProps) {
  const actions = useCanvasEditorActions()
  const validation = useCanvasValidation()
  const issues = validation.nodeIssues.get(node.id) ?? []
  const canvasLinks = getCanvasLinks(node.data.raw)
  const hasError = issues.some((issue) => issue.severity === 'error')
  const accent = colorFor(node.data.raw.color)
  const isGroup = node.data.raw.type === 'group'
  const isLane = node.data.entity?.entityType === 'resource' || node.data.entity?.entityType === 'db_schema'
  const isTable = node.data.entity?.entityType === 'table'
  const background = isGroup ? groupBackgroundFor(node.data.raw.color) : undefined
  const style: CSSProperties = {}
  if (accent) (style as Record<string, string>)['--card-accent'] = accent
  if (background) style.background = background
  const hasCardColor = Boolean(accent && !isGroup)

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
      {!isLane && !isTable && SIDES.map((side) => (
        <Handle
          key={side.id}
          id={side.id}
          type="source"
          position={side.position}
          className="canvas-handle"
          onDoubleClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            actions.autoFitNode(node.id)
          }}
        />
      ))}
      {!isGroup && !isLane && (canvasLinks.length > 0 || selected) && (
        <button
          type="button"
          className={`canvas-link-badge nodrag nopan${canvasLinks.length > 0 ? ' has-links' : ''}`}
          title={canvasLinks.length > 0
            ? `${canvasLinks.length} linked canvas${canvasLinks.length === 1 ? '' : 's'}`
            : 'Link a canvas'}
          aria-label="Manage linked canvases"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            actions.openCanvasLinks(node.id)
          }}
        >
          <Link2 size={11} />
          {canvasLinks.length > 1 ? <span>{canvasLinks.length}</span> : null}
        </button>
      )}
      {issues.length > 0 && (
        <button
          type="button"
          className={`canvas-warning-badge nodrag nopan${hasError ? ' error' : ''}`}
          title={issues.map((issue) => issue.message).join('\n')}
          aria-label={`${issues.length} validation ${issues.length === 1 ? 'issue' : 'issues'}`}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            validation.openIssue(issues[0]!)
          }}
        >
          {hasError ? <AlertCircle size={11} /> : <AlertTriangle size={11} />}
          {issues.length > 1 ? <span>{issues.length}</span> : null}
        </button>
      )}
      <div
        className={`canvas-node ${className}${selected ? ' selected' : ''}${hasCardColor ? ' has-card-color' : ''}`}
        style={Object.keys(style).length > 0 ? style : undefined}
        onDoubleClickCapture={(event) => {
          if (node.data.raw.type === 'group') return
          const target = event.target as HTMLElement
          if (target.closest('button, a, input, textarea, select')) return
          const rect = event.currentTarget.getBoundingClientRect()
          const edge = 8
          const nearEdge = event.clientX <= rect.left + edge
            || event.clientX >= rect.right - edge
            || event.clientY <= rect.top + edge
            || event.clientY >= rect.bottom - edge
          if (nearEdge) {
            event.preventDefault()
            event.stopPropagation()
            actions.autoFitNode(node.id)
            return
          }
          if (!onEdit) return
          event.preventDefault()
          event.stopPropagation()
          onEdit()
        }}
      >
        {children}
      </div>
    </>
  )
}
