import {
  CURRENT_CANVAS_DOCUMENT_SCHEMA_VERSION,
  EMPTY_CANVAS,
  createCanvasId,
  type CanvasDocument,
  type CanvasSummary,
  type JsonCanvas,
} from '@canvas/contract'

import type { CanvasPrincipal } from '../auth'
import {
  CanvasConflictError,
  CanvasNotFoundError,
  summarize,
  type CanvasStore,
} from './canvasStore'

function now(): string {
  return new Date().toISOString()
}

function nextEtag(): string {
  return crypto.randomUUID()
}

export class MemoryCanvasStore implements CanvasStore {
  private readonly documents = new Map<string, CanvasDocument>()

  private key(tenantId: string, id: string): string {
    return `${tenantId}:${id}`
  }

  async list(tenantId: string): Promise<CanvasSummary[]> {
    return [...this.documents.entries()]
      .filter(([key]) => key.startsWith(`${tenantId}:`))
      .map(([, document]) => summarize(document))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  }

  async create(
    tenantId: string,
    title: string,
    principal: CanvasPrincipal,
    canvas: JsonCanvas = structuredClone(EMPTY_CANVAS),
  ): Promise<CanvasDocument> {
    const id = createCanvasId()
    const document: CanvasDocument = {
      id,
      title,
      schemaVersion: CURRENT_CANVAS_DOCUMENT_SCHEMA_VERSION,
      etag: nextEtag(),
      updatedAt: now(),
      updatedBy: principal.displayName,
      nodeCount: canvas.nodes?.length ?? 0,
      edgeCount: canvas.edges?.length ?? 0,
      canvas: structuredClone(canvas),
    }
    this.documents.set(this.key(tenantId, id), document)
    return structuredClone(document)
  }

  async get(tenantId: string, id: string): Promise<CanvasDocument | null> {
    const document = this.documents.get(this.key(tenantId, id))
    return document ? structuredClone(document) : null
  }

  async save(
    tenantId: string,
    id: string,
    canvas: JsonCanvas,
    ifMatch: string,
    principal: CanvasPrincipal,
  ): Promise<CanvasDocument> {
    const key = this.key(tenantId, id)
    const current = this.documents.get(key)
    if (!current) throw new CanvasNotFoundError(id)
    if (current.etag !== ifMatch) throw new CanvasConflictError(structuredClone(current))
    const next: CanvasDocument = {
      ...current,
      etag: nextEtag(),
      updatedAt: now(),
      updatedBy: principal.displayName,
      nodeCount: canvas.nodes?.length ?? 0,
      edgeCount: canvas.edges?.length ?? 0,
      canvas: structuredClone(canvas),
    }
    this.documents.set(key, next)
    return structuredClone(next)
  }

  async rename(
    tenantId: string,
    id: string,
    title: string,
    ifMatch: string,
    principal: CanvasPrincipal,
  ): Promise<CanvasDocument> {
    const key = this.key(tenantId, id)
    const current = this.documents.get(key)
    if (!current) throw new CanvasNotFoundError(id)
    if (current.etag !== ifMatch) throw new CanvasConflictError(structuredClone(current))
    const next: CanvasDocument = {
      ...current,
      title,
      etag: nextEtag(),
      updatedAt: now(),
      updatedBy: principal.displayName,
    }
    this.documents.set(key, next)
    return structuredClone(next)
  }

  async remove(tenantId: string, id: string, ifMatch: string): Promise<void> {
    const key = this.key(tenantId, id)
    const current = this.documents.get(key)
    if (!current) throw new CanvasNotFoundError(id)
    if (current.etag !== ifMatch) throw new CanvasConflictError(structuredClone(current))
    this.documents.delete(key)
  }
}
