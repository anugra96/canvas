import type {
  CanvasDocument,
  CanvasSummary,
  JsonCanvas,
} from '@canvas/contract'

import type { CanvasPrincipal } from '../auth'

export interface CanvasStore {
  list(tenantId: string): Promise<CanvasSummary[]>
  create(
    tenantId: string,
    title: string,
    principal: CanvasPrincipal,
    canvas?: JsonCanvas,
  ): Promise<CanvasDocument>
  get(tenantId: string, id: string): Promise<CanvasDocument | null>
  save(
    tenantId: string,
    id: string,
    canvas: JsonCanvas,
    ifMatch: string,
    principal: CanvasPrincipal,
  ): Promise<CanvasDocument>
  rename(
    tenantId: string,
    id: string,
    title: string,
    ifMatch: string,
    principal: CanvasPrincipal,
  ): Promise<CanvasDocument>
}

export class CanvasNotFoundError extends Error {
  constructor(id: string) {
    super(`Canvas "${id}" was not found.`)
    this.name = 'CanvasNotFoundError'
  }
}

export class CanvasConflictError extends Error {
  readonly latest: CanvasDocument

  constructor(latest: CanvasDocument) {
    super('The canvas changed on another client.')
    this.name = 'CanvasConflictError'
    this.latest = latest
  }
}

export function summarize(document: CanvasDocument): CanvasSummary {
  return {
    id: document.id,
    title: document.title,
    etag: document.etag,
    updatedAt: document.updatedAt,
    updatedBy: document.updatedBy,
    nodeCount: document.canvas.nodes?.length ?? 0,
    edgeCount: document.canvas.edges?.length ?? 0,
    profile: document.canvas.app?.profile ?? 'raw',
  }
}
