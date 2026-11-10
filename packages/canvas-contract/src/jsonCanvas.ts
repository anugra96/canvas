import { z } from 'zod'

import { canvasEdgeMetaSchema, canvasNodeMetaSchema } from './ontology'
import { canvasProfileMetadataSchema, type CanvasProfileMetadata } from './profile'

export const CANVAS_NODE_SIDES = ['top', 'right', 'bottom', 'left'] as const
export const CANVAS_EDGE_ENDS = ['none', 'arrow'] as const

const finiteNumber = z.number().finite()

const nodeBaseSchema = z
  .object({
    id: z.string().min(1),
    x: finiteNumber,
    y: finiteNumber,
    width: finiteNumber.positive(),
    height: finiteNumber.positive(),
    color: z.string().min(1).optional(),
    app: canvasNodeMetaSchema.optional(),
  })
  .passthrough()

export const textNodeSchema = nodeBaseSchema.extend({
  type: z.literal('text'),
  text: z.string(),
})

export const fileNodeSchema = nodeBaseSchema.extend({
  type: z.literal('file'),
  file: z.string().min(1),
  subpath: z.string().optional(),
})

export const linkNodeSchema = nodeBaseSchema.extend({
  type: z.literal('link'),
  url: z.string().min(1),
})

export const groupNodeSchema = nodeBaseSchema.extend({
  type: z.literal('group'),
  label: z.string().optional(),
  background: z.string().optional(),
  backgroundStyle: z.string().optional(),
})

export const canvasNodeSchema = z.discriminatedUnion('type', [
  textNodeSchema,
  fileNodeSchema,
  linkNodeSchema,
  groupNodeSchema,
])

export const canvasEdgeSchema = z
  .object({
    id: z.string().min(1),
    fromNode: z.string().min(1),
    fromSide: z.enum(CANVAS_NODE_SIDES).optional(),
    fromEnd: z.enum(CANVAS_EDGE_ENDS).optional(),
    toNode: z.string().min(1),
    toSide: z.enum(CANVAS_NODE_SIDES).optional(),
    toEnd: z.enum(CANVAS_EDGE_ENDS).optional(),
    color: z.string().min(1).optional(),
    label: z.string().optional(),
    app: canvasEdgeMetaSchema.optional(),
  })
  .passthrough()

export const jsonCanvasSchema = z
  .object({
    nodes: z.array(canvasNodeSchema).optional(),
    edges: z.array(canvasEdgeSchema).optional(),
    app: canvasProfileMetadataSchema.optional(),
  })
  .passthrough()

export type CanvasNodeSide = (typeof CANVAS_NODE_SIDES)[number]

export type TextNode = z.infer<typeof textNodeSchema> & Record<string, unknown>
export type FileNode = z.infer<typeof fileNodeSchema> & Record<string, unknown>
export type LinkNode = z.infer<typeof linkNodeSchema> & Record<string, unknown>
export type GroupNode = z.infer<typeof groupNodeSchema> & Record<string, unknown>
export type CanvasNode = TextNode | FileNode | LinkNode | GroupNode
export type CanvasEdge = z.infer<typeof canvasEdgeSchema> & Record<string, unknown>

export type JsonCanvas = {
  nodes?: CanvasNode[]
  edges?: CanvasEdge[]
  app?: CanvasProfileMetadata
} & Record<string, unknown>

export interface CanvasSummary {
  id: string
  title: string
  etag: string
  updatedAt: string
  updatedBy: string
  nodeCount: number
  edgeCount: number
  profile?: string
}

export interface CanvasDocument extends CanvasSummary {
  schemaVersion: number
  canvas: JsonCanvas
}

export const EMPTY_CANVAS: JsonCanvas = { nodes: [], edges: [] }

export function createCanvasId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function createNodeId(): string {
  return createCanvasId()
}
