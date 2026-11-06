import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  EMPTY_CANVAS,
  createCanvasId,
  type CanvasDocument,
  type CanvasSummary,
  type JsonCanvas,
} from '@skyward/canvas-contract'

import type { CanvasPrincipal } from '../auth'
import {
  CanvasConflictError,
  CanvasNotFoundError,
  summarize,
  type CanvasStore,
} from './canvasStore'

const SAFE_SEGMENT = /^[A-Za-z0-9_-]{1,128}$/

function now(): string {
  return new Date().toISOString()
}

function nextEtag(): string {
  return crypto.randomUUID()
}

function safeSegment(value: string): string {
  if (!SAFE_SEGMENT.test(value)) throw new CanvasNotFoundError(value)
  return value
}

function parseDocument(value: unknown): CanvasDocument {
  return value as CanvasDocument
}

export class FileCanvasStore implements CanvasStore {
  private writeQueue: Promise<unknown> = Promise.resolve()

  constructor(private readonly root: string) {}

  private tenantDir(tenantId: string): string {
    return join(this.root, safeSegment(tenantId))
  }

  private filePath(tenantId: string, id: string): string {
    return join(this.tenantDir(tenantId), `${safeSegment(id)}.json`)
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.writeQueue.then(operation, operation)
    this.writeQueue = next.then(() => undefined, () => undefined)
    return next
  }

  private async readDocument(tenantId: string, id: string): Promise<CanvasDocument | null> {
    try {
      const raw = await readFile(this.filePath(tenantId, id), 'utf8')
      return parseDocument(JSON.parse(raw))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  }

  private async writeDocument(tenantId: string, document: CanvasDocument): Promise<void> {
    const directory = this.tenantDir(tenantId)
    await mkdir(directory, { recursive: true })
    const target = this.filePath(tenantId, document.id)
    const temporary = `${target}.${crypto.randomUUID()}.tmp`
    await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
    await rename(temporary, target)
  }

  async list(tenantId: string): Promise<CanvasSummary[]> {
    try {
      const entries = await readdir(this.tenantDir(tenantId), { withFileTypes: true })
      const documents = await Promise.all(
        entries
          .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
          .map(async (entry) => {
            try {
              const raw = await readFile(join(this.tenantDir(tenantId), entry.name), 'utf8')
              return parseDocument(JSON.parse(raw))
            } catch {
              return null
            }
          }),
      )
      return documents
        .filter((document): document is CanvasDocument => document !== null)
        .map(summarize)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
  }

  async create(
    tenantId: string,
    title: string,
    principal: CanvasPrincipal,
    canvas: JsonCanvas = structuredClone(EMPTY_CANVAS),
  ): Promise<CanvasDocument> {
    return this.enqueue(async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const id = createCanvasId()
        const document: CanvasDocument = {
          id,
          title,
          etag: nextEtag(),
          updatedAt: now(),
          updatedBy: principal.displayName,
          nodeCount: canvas.nodes?.length ?? 0,
          edgeCount: canvas.edges?.length ?? 0,
          canvas: structuredClone(canvas),
        }
        try {
          await writeFile(
            this.filePath(tenantId, id),
            `${JSON.stringify(document, null, 2)}\n`,
            { encoding: 'utf8', flag: 'wx' },
          )
          return document
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
            await mkdir(this.tenantDir(tenantId), { recursive: true })
            await writeFile(
              this.filePath(tenantId, id),
              `${JSON.stringify(document, null, 2)}\n`,
              { encoding: 'utf8', flag: 'wx' },
            )
            return document
          }
        }
      }
      throw new Error('Could not allocate a canvas id.')
    })
  }

  async get(tenantId: string, id: string): Promise<CanvasDocument | null> {
    return this.readDocument(tenantId, id)
  }

  async save(
    tenantId: string,
    id: string,
    canvas: JsonCanvas,
    ifMatch: string,
    principal: CanvasPrincipal,
  ): Promise<CanvasDocument> {
    return this.enqueue(async () => {
      const current = await this.readDocument(tenantId, id)
      if (!current) throw new CanvasNotFoundError(id)
      if (current.etag !== ifMatch) throw new CanvasConflictError(current)
      const next: CanvasDocument = {
        ...current,
        etag: nextEtag(),
        updatedAt: now(),
        updatedBy: principal.displayName,
        nodeCount: canvas.nodes?.length ?? 0,
        edgeCount: canvas.edges?.length ?? 0,
        canvas,
      }
      await this.writeDocument(tenantId, next)
      return next
    })
  }
}
