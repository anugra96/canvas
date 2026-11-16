import type { CanvasEdge, CanvasNode, JsonCanvas } from '../jsonCanvas'

export type JsonObject = Record<string, unknown>

export interface OpenApiParseResult {
  document: JsonObject
  warnings: string[]
}

export interface OpenApiImportResult {
  title: string
  canvas: JsonCanvas
  warnings: string[]
}

export interface ManagedRelation {
  id: string
  fromNode: string
  toNode: string
  relationType: 'contains' | 'accepts' | 'returns' | 'authenticates_via' | 'uses'
  label?: string
  status?: string
  mediaType?: string
  endpoint?: string
}

export interface ApiReferenceParameter {
  name: string
  location: string
  required: boolean
  type?: string
  description?: string
}

export interface ApiReferenceResponse {
  status: string
  description?: string
  model?: string
}

export interface ApiReferenceEndpoint {
  id: string
  method: string
  path: string
  summary?: string
  description?: string
  deprecated: boolean
  parameters: ApiReferenceParameter[]
  requestModels: string[]
  responses: ApiReferenceResponse[]
  security: string[]
  securityOverride: boolean
}

export interface ApiReferenceSummary {
  title: string
  version: string
  description?: string
  servers: string[]
  globalSecurity: string[]
  resourceCount: number
  endpointCount: number
  schemaCount: number
}

export interface ApiReferenceDocument {
  summary: ApiReferenceSummary
  resources: ApiReferenceResource[]
  securityUsage: Record<string, number>
}

export interface ApiReferenceResource {
  id: string
  name: string
  description?: string
  inferred: boolean
  endpoints: ApiReferenceEndpoint[]
}

export type CanvasWithRelations = Pick<JsonCanvas, 'nodes' | 'edges'>
export type ManagedEdge = CanvasEdge
export type ApiNode = CanvasNode
