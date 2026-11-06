import {
  MarkerType,
  type Edge,
  type Node,
} from '@xyflow/react'
import {
  DEFAULT_ONTOLOGY,
  findRelationType,
  getEdgeMeta,
  getEntityMeta,
  type CanvasEdge,
  type CanvasEntityMeta,
  type CanvasNode,
  type CanvasNodeSide,
  type JsonCanvas,
  type Ontology,
} from '@skyward/canvas-contract'

export type CanvasNodeData = {
  raw: CanvasNode
  text?: string
  label?: string
  url?: string
  file?: string
  entity?: CanvasEntityMeta
} & Record<string, unknown>

export type CanvasEdgeData = {
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

const CARD_BACKGROUNDS: Record<string, string> = {
  '1': '#3a1f20',
  '2': '#3a2a1b',
  '3': '#37321b',
  '4': '#1e3424',
  '5': '#1b3335',
  '6': '#2b2338',
}

export function cardBackgroundFor(value: string | undefined): string | undefined {
  if (!value) return undefined
  if (CARD_BACKGROUNDS[value]) return CARD_BACKGROUNDS[value]
  const accent = colorFor(value)
  if (!accent) return undefined
  return accent.length === 7 ? `${accent}28` : accent
}

export function groupBackgroundFor(value: string | undefined): string | undefined {
  if (!value) return undefined
  const accent = colorFor(value)
  if (!accent) return undefined
  return accent.length === 7 ? `${accent}73` : accent
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
  return {
    id: raw.id,
    type: raw.type === 'text' && getEntityMeta(raw)
      ? (getEntityMeta(raw)?.entityType === 'code' ? 'code' : 'entity')
      : raw.type,
    position: { x: raw.x, y: raw.y },
    data: nodeData(raw),
    zIndex: raw.type === 'group' ? 0 : 1,
    style: {
      width: raw.width,
      height: raw.height,
    },
  }
}

export function toFlowEdge(
  raw: CanvasEdge,
  ontology: Ontology = DEFAULT_ONTOLOGY,
): CanvasFlowEdge {
  const relationType = getEdgeMeta(raw)?.relationType
  const relation = relationType ? findRelationType(ontology, relationType) : undefined
  const color = colorFor(raw.color ?? relation?.color) ?? '#6b7d8c'
  return {
    id: raw.id,
    source: raw.fromNode,
    target: raw.toNode,
    sourceHandle: raw.fromSide ?? 'right',
    targetHandle: raw.toSide ?? 'left',
    type: 'canvas',
    data: { raw, label: raw.label ?? relation?.label, relationType },
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
  return {
    nodes: (canvas.nodes ?? []).map(toFlowNode),
    edges: (canvas.edges ?? []).map((edge) => toFlowEdge(edge, ontology)),
  }
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
    if (edge.sourceHandle) raw.fromSide = edge.sourceHandle as CanvasNodeSide
    if (edge.targetHandle) raw.toSide = edge.targetHandle as CanvasNodeSide
    const label = edge.data?.label
    if (typeof label === 'string' && label) raw.label = label
    else delete raw.label
    const relationType = edge.data?.relationType
    if (typeof relationType === 'string' && relationType) {
      raw.skyward = { ...(raw.skyward ?? {}), relationType }
    } else if (raw.skyward) {
      delete (raw.skyward as Record<string, unknown>).relationType
    }
    return raw
  })

  return {
    ...base,
    nodes: nextNodes,
    edges: nextEdges,
  } as JsonCanvas
}
