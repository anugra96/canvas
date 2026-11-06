import {
  EMPTY_CANVAS,
  createCanvasId,
  type CanvasDocument,
  type CanvasSummary,
  type JsonCanvas,
} from '@skyward/canvas-contract'

import type { CanvasClient } from './client'
import { CanvasConflictError } from './errors'
import type { CanvasSession } from '../auth/auth'

function now(): string {
  return new Date().toISOString()
}

function nextEtag(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(16).slice(2)
}

function summary(document: CanvasDocument): CanvasSummary {
  return {
    id: document.id,
    title: document.title,
    etag: document.etag,
    updatedAt: document.updatedAt,
    updatedBy: document.updatedBy,
    nodeCount: document.canvas.nodes?.length ?? 0,
    edgeCount: document.canvas.edges?.length ?? 0,
  }
}

export function createMockCanvasClient(session: CanvasSession): CanvasClient {
  const documents = new Map<string, CanvasDocument>()

  return {
    async listCanvases() {
      return [...documents.values()]
        .map(summary)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    },

    async createCanvas(title = 'Untitled canvas') {
      const document: CanvasDocument = {
        id: createCanvasId(),
        title,
        etag: nextEtag(),
        updatedAt: now(),
        updatedBy: session.displayName,
        nodeCount: 0,
        edgeCount: 0,
        canvas: structuredClone(EMPTY_CANVAS),
      }
      documents.set(document.id, document)
      return structuredClone(document)
    },

    async importCanvas(title, canvas: JsonCanvas) {
      const document: CanvasDocument = {
        id: createCanvasId(),
        title,
        etag: nextEtag(),
        updatedAt: now(),
        updatedBy: session.displayName,
        nodeCount: canvas.nodes?.length ?? 0,
        edgeCount: canvas.edges?.length ?? 0,
        canvas: structuredClone(canvas),
      }
      documents.set(document.id, document)
      return structuredClone(document)
    },

    async getCanvas(id) {
      const document = documents.get(id)
      if (!document) throw new Error('Canvas not found.')
      return structuredClone(document)
    },

    async saveCanvas(id, etag, canvas) {
      const current = documents.get(id)
      if (!current) throw new Error('Canvas not found.')
      if (current.etag !== etag) {
        throw new CanvasConflictError(structuredClone(current))
      }
      const next: CanvasDocument = {
        ...current,
        etag: nextEtag(),
        updatedAt: now(),
        updatedBy: session.displayName,
        nodeCount: canvas.nodes?.length ?? 0,
        edgeCount: canvas.edges?.length ?? 0,
        canvas: structuredClone(canvas),
      }
      documents.set(id, next)
      return structuredClone(next)
    },

    async downloadCanvas(id) {
      const document = documents.get(id)
      if (!document) throw new Error('Canvas not found.')
      return
    },
  }
}
