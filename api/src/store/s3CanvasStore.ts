import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'

import {
  CURRENT_CANVAS_DOCUMENT_SCHEMA_VERSION,
  EMPTY_CANVAS,
  createCanvasId,
  migrateCanvasDocument,
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

const SAFE_SEGMENT = /^[A-Za-z0-9_-]{1,128}$/

export interface S3CanvasStoreOptions {
  bucket: string
  region?: string
  endpoint?: string
  accessKeyId?: string
  secretAccessKey?: string
}

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

function objectKey(tenantId: string, id: string): string {
  return `tenants/${safeSegment(tenantId)}/canvases/${safeSegment(id)}.json`
}

function tenantPrefix(tenantId: string): string {
  return `tenants/${safeSegment(tenantId)}/canvases/`
}

export class S3CanvasStore implements CanvasStore {
  private readonly client: S3Client
  private readonly bucket: string
  private ready: Promise<void> | null = null

  constructor(options: S3CanvasStoreOptions, client?: S3Client) {
    this.bucket = options.bucket
    this.client = client ?? new S3Client({
      region: options.region ?? 'us-east-1',
      ...(options.endpoint ? { endpoint: options.endpoint, forcePathStyle: true } : {}),
      ...(options.accessKeyId && options.secretAccessKey
        ? {
          credentials: {
            accessKeyId: options.accessKeyId,
            secretAccessKey: options.secretAccessKey,
          },
        }
        : {}),
    })
  }

  private async ensureBucket(): Promise<void> {
    this.ready ??= (async () => {
      try {
        await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }))
      } catch (error) {
        const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
        if (status !== 404) throw error
        try {
          await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }))
        } catch (createError) {
          const code = (createError as { name?: string }).name
          if (code !== 'BucketAlreadyOwnedByYou' && code !== 'BucketAlreadyExists') throw createError
        }
      }
    })()
    return this.ready
  }

  private async readDocument(tenantId: string, id: string): Promise<CanvasDocument | null> {
    await this.ensureBucket()
    try {
      const response = await this.client.send(new GetObjectCommand({
        Bucket: this.bucket,
        Key: objectKey(tenantId, id),
      }))
      const body = await response.Body?.transformToString()
      if (!body) return null
      return migrateCanvasDocument(JSON.parse(body) as CanvasDocument)
    } catch (error) {
      if ((error as { name?: string }).name === 'NoSuchKey') return null
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
      if (status === 404) return null
      throw error
    }
  }

  private async writeDocument(tenantId: string, document: CanvasDocument): Promise<void> {
    await this.ensureBucket()
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey(tenantId, document.id),
      Body: `${JSON.stringify(document, null, 2)}\n`,
      ContentType: 'application/json',
    }))
  }

  async list(tenantId: string): Promise<CanvasSummary[]> {
    await this.ensureBucket()
    const documents: CanvasDocument[] = []
    let continuationToken: string | undefined
    do {
      const response = await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: tenantPrefix(tenantId),
        ContinuationToken: continuationToken,
      }))
      for (const object of response.Contents ?? []) {
        if (!object.Key?.endsWith('.json')) continue
        const body = await this.client.send(new GetObjectCommand({
          Bucket: this.bucket,
          Key: object.Key,
        }))
        const text = await body.Body?.transformToString()
        if (!text) continue
        try {
          documents.push(migrateCanvasDocument(JSON.parse(text) as CanvasDocument))
        } catch {
          continue
        }
      }
      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined
    } while (continuationToken)

    return documents
      .map(summarize)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  }

  async create(
    tenantId: string,
    title: string,
    principal: CanvasPrincipal,
    canvas: JsonCanvas = structuredClone(EMPTY_CANVAS),
  ): Promise<CanvasDocument> {
    const document: CanvasDocument = {
      id: createCanvasId(),
      title,
      schemaVersion: CURRENT_CANVAS_DOCUMENT_SCHEMA_VERSION,
      etag: nextEtag(),
      updatedAt: now(),
      updatedBy: principal.displayName,
      nodeCount: canvas.nodes?.length ?? 0,
      edgeCount: canvas.edges?.length ?? 0,
      canvas: structuredClone(canvas),
    }
    await this.writeDocument(tenantId, document)
    return document
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
  }
  async rename(
    tenantId: string,
    id: string,
    title: string,
    ifMatch: string,
    principal: CanvasPrincipal,
  ): Promise<CanvasDocument> {
    const current = await this.readDocument(tenantId, id)
    if (!current) throw new CanvasNotFoundError(id)
    if (current.etag !== ifMatch) throw new CanvasConflictError(current)
    const next: CanvasDocument = {
      ...current,
      title,
      etag: nextEtag(),
      updatedAt: now(),
      updatedBy: principal.displayName,
    }
    await this.writeDocument(tenantId, next)
    return next
  }

}
