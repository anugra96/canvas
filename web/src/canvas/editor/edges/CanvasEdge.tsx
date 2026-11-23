import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
} from '@xyflow/react'

import { AlertCircle, AlertTriangle } from 'lucide-react'

import type { EdgeOrigin } from '@canvas/contract'

import type { CanvasFlowEdge } from '../../model/adapter'
import { useCanvasEditorActions } from '../CanvasEditorContext'
import { useCanvasValidation } from '../CanvasValidationContext'
import { getCanvasEdgePath, type EdgePathResult } from '../../model/edgePath'
import { useEdgeStyle } from '../../model/edgeStyle'

export function CanvasEdge({
  id,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  markerEnd,
  markerStart,
  style,
  data,
  selected,
  interactionWidth = 24,
  pathOverride,
}: EdgeProps<CanvasFlowEdge> & { pathOverride?: EdgePathResult }) {
  const actions = useCanvasEditorActions()
  const validation = useCanvasValidation()
  const edgeStyle = useEdgeStyle()
  const issues = validation.edgeIssues.get(id) ?? []
  const hasError = issues.some((issue) => issue.severity === 'error')
  const pathResult = pathOverride ?? getCanvasEdgePath({
    id,
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  }, edgeStyle)
  const path = pathResult.path
  const labelX = pathResult.labelX
  const labelY = pathResult.labelY
  const label = data?.label
  const untyped = !data?.relationType
  // An endpoint label is a case-sensitive path: show it as written.
  const endpoint = Boolean(data?.raw?.app?.endpoint)
  const origin = data?.origin as EdgeOrigin | undefined
  const originCardName = data?.originCardName as string | undefined
  const tooltip = origin === 'managed'
    ? `Managed edge${originCardName ? ` · Edited through ${originCardName}` : ''}`
    : origin === 'inferred'
      ? 'Inferred edge'
      : 'Explicit edge'

  return (
    <>
      <BaseEdge
        id={`${id}-halo`}
        className="canvas-edge-halo"
        path={path}
        interactionWidth={0}
        style={{ stroke: 'var(--ui-edge-outline)', strokeWidth: selected ? 6 : 5, opacity: 0.72 }}
      />
      <BaseEdge
        id={id}
        className="canvas-edge-main"
        path={path}
        markerEnd={markerEnd}
        markerStart={markerStart}
        interactionWidth={interactionWidth}
        style={{
          ...style,
          strokeWidth: selected ? 3 : 2,
        }}
      />
      {(label || issues.length > 0) && (
        <EdgeLabelRenderer>
          <div
            className="edge-label-wrap nodrag nopan"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {label && (
              <div
                className={`edge-label${untyped ? ' untyped' : ''}${endpoint ? ' endpoint' : ''}`}
                title={tooltip}
                onClick={(event) => {
                  event.stopPropagation()
                  actions.selectEdge(id)
                }}
                onDoubleClick={(event) => {
                  event.stopPropagation()
                  actions.editEdgeLabel(id, event.clientX, event.clientY)
                }}
              >
                {label}
              </div>
            )}
            {issues.length > 0 && (
              <button
                type="button"
                className={`edge-warning-badge nodrag nopan${hasError ? ' error' : ''}`}
                title={issues.map((issue) => issue.message).join('\n')}
                aria-label={`${issues.length} edge validation ${issues.length === 1 ? 'issue' : 'issues'}`}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  validation.openIssue(issues[0]!)
                }}
              >
                {hasError ? <AlertCircle size={10} /> : <AlertTriangle size={10} />}
                {issues.length > 1 ? <span>{issues.length}</span> : null}
              </button>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
