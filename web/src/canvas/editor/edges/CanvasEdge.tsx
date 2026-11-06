import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
} from '@xyflow/react'

import type { CanvasFlowEdge } from '../../model/adapter'
import { getCanvasEdgePath } from '../../model/edgePath'

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
}: EdgeProps<CanvasFlowEdge>) {
  const { path, labelX, labelY } = getCanvasEdgePath({
    id,
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })
  const label = data?.label

  return (
    <>
      <BaseEdge
        id={`${id}-halo`}
        className="canvas-edge-halo"
        path={path}
        style={{ stroke: '#0b0d0f', strokeWidth: selected ? 6 : 5, opacity: 0.72 }}
      />
      <BaseEdge
        id={id}
        className="canvas-edge-main"
        path={path}
        markerEnd={markerEnd}
        markerStart={markerStart}
        style={{
          ...style,
          strokeWidth: selected ? 3 : 2,
        }}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            className="edge-label nodrag nopan"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
