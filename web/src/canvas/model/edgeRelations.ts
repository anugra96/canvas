import { MarkerType, type Connection } from '@xyflow/react'
import {
  DEFAULT_ONTOLOGY,
  createNodeId,
  findRelationType,
  type CanvasEdge,
  type Ontology,
} from '@skyward/canvas-contract'

import { colorFor, type CanvasFlowEdge } from './adapter'

function side(
  value: string | null | undefined,
  fallback: 'left' | 'right',
): 'top' | 'right' | 'bottom' | 'left' {
  return value === 'top' || value === 'right' || value === 'bottom' || value === 'left'
    ? value
    : fallback
}

export function edgeFromConnection(
  connection: Pick<Connection, 'source' | 'target' | 'sourceHandle' | 'targetHandle'>,
  relationTypeId: string,
  ontology: Ontology = DEFAULT_ONTOLOGY,
): CanvasEdge {
  const relation = findRelationType(ontology, relationTypeId)
  return {
    id: createNodeId(),
    fromNode: connection.source,
    fromSide: side(connection.sourceHandle, 'right'),
    toNode: connection.target,
    toSide: side(connection.targetHandle, 'left'),
    toEnd: 'arrow',
    color: relation?.color,
    label: relation?.label,
    skyward: { relationType: relation?.id ?? 'relates_to' },
  }
}

export function applyColorToFlowEdge(
  edge: CanvasFlowEdge,
  color: string | undefined,
): CanvasFlowEdge {
  const stroke = colorFor(color)
  const raw = edge.data?.raw
  if (!raw) return edge
  const nextRaw = { ...raw }
  if (color) nextRaw.color = color
  else delete nextRaw.color
  return {
    ...edge,
    style: { ...edge.style, stroke: stroke ?? '#6b7d8c' },
    markerEnd: edge.markerEnd
      ? { type: MarkerType.ArrowClosed, color: stroke ?? '#6b7d8c' }
      : undefined,
    markerStart: edge.markerStart
      ? { type: MarkerType.ArrowClosed, color: stroke ?? '#6b7d8c' }
      : undefined,
    data: { ...edge.data, raw: nextRaw },
  }
}

export function applyLabelToFlowEdge(
  edge: CanvasFlowEdge,
  label: string,
): CanvasFlowEdge {
  const raw = edge.data?.raw
  if (!raw) return edge
  const value = label.trim()
  const nextRaw = { ...raw }
  if (value) nextRaw.label = value
  else delete nextRaw.label
  return {
    ...edge,
    label: value || undefined,
    data: {
      ...edge.data,
      label: value || undefined,
      raw: nextRaw,
    },
  }
}

export function applyRelationToFlowEdge(
  edge: CanvasFlowEdge,
  relationTypeId: string,
  ontology: Ontology = DEFAULT_ONTOLOGY,
): CanvasFlowEdge {
  const relation = findRelationType(ontology, relationTypeId)
  const raw = edge.data?.raw
  if (!raw) return edge
  return {
    ...edge,
    label: relation?.label,
    style: {
      ...edge.style,
      stroke: colorFor(relation?.color) ?? edge.style?.stroke,
    },
    data: {
      ...edge.data,
      label: relation?.label,
      relationType: relationTypeId,
      raw: {
        ...raw,
        label: relation?.label,
        color: relation?.color,
        skyward: { ...(raw.skyward ?? {}), relationType: relationTypeId },
      },
    },
  }
}


export function reverseFlowEdge(edge: CanvasFlowEdge): CanvasFlowEdge {
  const raw = edge.data?.raw
  if (!raw) return edge
  const nextRaw = { ...raw }
  nextRaw.fromNode = raw.toNode
  nextRaw.toNode = raw.fromNode
  if (raw.toSide) nextRaw.fromSide = raw.toSide
  else delete nextRaw.fromSide
  if (raw.fromSide) nextRaw.toSide = raw.fromSide
  else delete nextRaw.toSide
  if (raw.toEnd) nextRaw.fromEnd = raw.toEnd
  else delete nextRaw.fromEnd
  if (raw.fromEnd) nextRaw.toEnd = raw.fromEnd
  else delete nextRaw.toEnd
  if ('toFloating' in raw || 'fromFloating' in raw) {
    nextRaw.fromFloating = raw.toFloating
    nextRaw.toFloating = raw.fromFloating
  }
  return {
    ...edge,
    source: edge.target,
    target: edge.source,
    sourceHandle: edge.targetHandle,
    targetHandle: edge.sourceHandle,
    markerStart: edge.markerEnd,
    markerEnd: edge.markerStart,
    data: { ...edge.data, raw: nextRaw },
  }
}


export function reconnectFlowEdge(
  edge: CanvasFlowEdge,
  connection: Pick<Connection, 'source' | 'target' | 'sourceHandle' | 'targetHandle'>,
): CanvasFlowEdge {
  const raw = edge.data?.raw
  if (!raw) return edge
  const fromSide = side(connection.sourceHandle, (raw.fromSide as 'left' | 'right' | undefined) ?? 'right')
  const toSide = side(connection.targetHandle, (raw.toSide as 'left' | 'right' | undefined) ?? 'left')
  return {
    ...edge,
    source: connection.source,
    target: connection.target,
    sourceHandle: fromSide,
    targetHandle: toSide,
    data: {
      ...edge.data,
      raw: {
        ...raw,
        fromNode: connection.source,
        toNode: connection.target,
        fromSide,
        toSide,
      },
    },
  }
}
