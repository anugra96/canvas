import type { EdgeProps } from '@xyflow/react'

import {
  referenceRoutePath,
  type ReferenceRoutePoint,
} from '@canvas/contract'

import type { CanvasFlowEdge } from '../../model/adapter'
import { CanvasEdge } from './CanvasEdge'

export function DatabaseReferenceEdge(props: EdgeProps<CanvasFlowEdge>) {
  const route = props.data?.referenceRoute as ReferenceRoutePoint[] | undefined
  if (!route || route.length < 2) return <CanvasEdge {...props} />
  const routed = referenceRoutePath(route)
  return (
    <CanvasEdge
      {...props}
      pathOverride={{ path: routed.path, labelX: routed.label.x, labelY: routed.label.y }}
    />
  )
}
