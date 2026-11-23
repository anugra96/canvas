import {
  MarkerType,
  type Edge,
  type Node,
} from '@xyflow/react'
import {
  DEFAULT_ONTOLOGY,
  databaseColumnHandleId,
  findRelationType,
  getEdgeMeta,
  getEntityMeta,
  isDatabaseColumnHandle,
  type CanvasEdge,
  type CanvasEntityMeta,
  type CanvasNode,
  type CanvasNodeSide,
  type JsonCanvas,
  type Ontology,
} from '@canvas/contract'

type CanvasNodeData = {
  raw: CanvasNode
  text?: string
  label?: string
  url?: string
  file?: string
  entity?: CanvasEntityMeta
} & Record<string, unknown>

type CanvasEdgeData = {
  raw: CanvasEdge
  label?: string
  relationType?: string
} & Record<string, unknown>

export type CanvasFlowNode = Node<CanvasNodeData>
export type CanvasFlowEdge = Edge<CanvasEdgeData>

const PRESET_COLORS: Record<string, string> = {
  '1': '#fb464c',
  '2': '#e9973f',
  '3': '#e0de71',
  '4': '#44cf6e',
  '5': '#53dfdd',
  '6': '#a882ff',
}

export const CANVAS_COLOR_PRESETS = Object.entries(PRESET_COLORS).map(([id, hex]) => ({ id, hex }))

export function cardBackgroundFor(value: string | undefined): string | undefined {
  const accent = colorFor(value)
  if (!accent) return undefined
  return `color-mix(in srgb, ${accent} 14%, var(--ui-panel-solid))`
}

export function colorFor(value: string | undefined): string | undefined {
  if (!value) return undefined
  return PRESET_COLORS[value] ?? (value.startsWith('#') ? value : undefined)
}

function nodeData(raw: CanvasNode): CanvasNodeData {
  const entity = getEntityMeta(raw)
  return {
    raw,
    text: raw.type === 'text' ? raw.text : undefined,
    label: raw.type === 'group' ? raw.label : undefined,
    url: raw.type === 'link' ? raw.url : undefined,
    file: raw.type === 'file' ? raw.file : undefined,
    entity,
  }
}

export function toFlowNode(raw: CanvasNode): CanvasFlowNode {
  const meta = getEntityMeta(raw)
  const autoHeight = meta?.entityType === 'endpoint'
  return {
    id: raw.id,
    type: raw.type === 'text' && meta
      ? (
        meta.entityType === 'code'
          ? 'code'
          : meta.entityType === 'schema'
            ? 'schema'
            : 'entity'
      )
      : raw.type,
    position: { x: raw.x, y: raw.y },
    data: nodeData(raw),
    zIndex: raw.type === 'group' || meta?.entityType === 'resource' || meta?.entityType === 'db_schema' ? 0 : 1,
    style: {
      width: raw.width,
      ...(autoHeight ? {} : { height: raw.height }),
    },
  }
}

export function toFlowEdge(
  raw: CanvasEdge,
  ontology: Ontology = DEFAULT_ONTOLOGY,
): CanvasFlowEdge {
  const meta = getEdgeMeta(raw)
  const relationType = meta?.relationType
  const relation = relationType ? findRelationType(ontology, relationType) : undefined
  const color = colorFor(raw.color ?? relation?.color) ?? '#6b7d8c'
  const fromColumn = typeof meta?.fromColumn === 'string' ? meta.fromColumn : undefined
  const toColumn = typeof meta?.toColumn === 'string' ? meta.toColumn : undefined
  return {
    id: raw.id,
    source: raw.fromNode,
    target: raw.toNode,
    sourceHandle: fromColumn
      ? databaseColumnHandleId(fromColumn, raw.fromSide === 'left' ? 'left' : 'right')
      : raw.fromSide ?? 'right',
    targetHandle: toColumn
      ? databaseColumnHandleId(toColumn, raw.toSide === 'right' ? 'right' : 'left')
      : raw.toSide ?? 'left',
    type: 'canvas',
    data: { raw, label: meta?.endpoint ?? raw.label ?? relation?.label, relationType },
    style: { stroke: color, strokeWidth: 2 },
    markerEnd: raw.toEnd === 'none'
      ? undefined
      : { type: MarkerType.ArrowClosed, color },
    markerStart: raw.fromEnd === 'arrow'
      ? { type: MarkerType.ArrowClosed, color }
      : undefined,
  }
}

export function toFlowCanvas(
  canvas: JsonCanvas,
  ontology: Ontology = DEFAULT_ONTOLOGY,
): {
  nodes: CanvasFlowNode[]
  edges: CanvasFlowEdge[]
} {
  const nodes = (canvas.nodes ?? []).map(toFlowNode)
  const edges = (canvas.edges ?? []).map((edge) => toFlowEdge(edge, ontology))
  return { nodes, edges }
}

function styleDimension(node: CanvasFlowNode, key: 'width' | 'height', fallback: number): number {
  const styleValue = node.style?.[key]
  if (typeof styleValue === 'number' && Number.isFinite(styleValue)) return styleValue
  if (typeof styleValue === 'string') {
    const parsed = Number.parseFloat(styleValue)
    if (Number.isFinite(parsed)) return parsed
  }
  const measured = key === 'width' ? node.measured?.width : node.measured?.height
  if (typeof measured === 'number' && Number.isFinite(measured)) return measured
  const direct = key === 'width' ? node.width : node.height
  if (typeof direct === 'number' && Number.isFinite(direct)) return direct
  return fallback
}

export function nodeDimensions(node: CanvasFlowNode): { width: number; height: number } {
  const raw = node.data.raw
  return {
    width: Math.round(styleDimension(node, 'width', raw.width)),
    height: Math.round(styleDimension(node, 'height', raw.height)),
  }
}

export function fromFlowCanvas(
  nodes: CanvasFlowNode[],
  edges: CanvasFlowEdge[],
  base: JsonCanvas,
): JsonCanvas {
  const nextNodes = nodes.map((node) => {
    const raw = { ...node.data.raw } as CanvasNode
    raw.x = Math.round(node.position.x)
    raw.y = Math.round(node.position.y)
    raw.width = Math.round(styleDimension(node, 'width', raw.width))
    raw.height = Math.round(styleDimension(node, 'height', raw.height))
    if (raw.type === 'text') {
      raw.text = String(node.data.text ?? raw.text ?? '')
    }
    if (raw.type === 'group') {
      const label = node.data.label
      if (typeof label === 'string' && label) raw.label = label
      else delete raw.label
    }
    return raw
  })

  const nextEdges = edges.map((edge) => {
    const raw = { ...(edge.data?.raw as CanvasEdge) }
    raw.fromNode = edge.source
    raw.toNode = edge.target
    if (edge.sourceHandle && !isDatabaseColumnHandle(edge.sourceHandle)) {
      raw.fromSide = edge.sourceHandle as CanvasNodeSide
    }
    if (edge.targetHandle && !isDatabaseColumnHandle(edge.targetHandle)) {
      raw.toSide = edge.targetHandle as CanvasNodeSide
    }
    const label = edge.data?.label
    if (typeof label === 'string' && label) raw.label = label
    else delete raw.label
    const relationType = edge.data?.relationType
    if (typeof relationType === 'string' && relationType) {
      raw.app = { ...(raw.app ?? {}), relationType }
    } else if (raw.app) {
      delete (raw.app as Record<string, unknown>).relationType
    }
    return raw
  })

  return {
    ...base,
    nodes: nextNodes,
    edges: nextEdges,
  } as JsonCanvas
}
