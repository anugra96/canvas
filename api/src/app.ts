import { Hono, type Context } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'

import {
  MAX_CANVAS_BYTES,
  canvasByteSize,
  normalizeImportedCanvas,
  validateCanvas,
  type CanvasDocument,
} from '@skyward/canvas-contract'

import {
  requireCanvasPrincipal,
  type AuthMode,
} from './auth'
import { loadOntology } from './ontology'
import {
  CanvasConflictError,
  CanvasNotFoundError,
  type CanvasStore,
} from './store/canvasStore'

const createCanvasSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
})

const saveCanvasSchema = z.object({
  canvas: z.unknown(),
})

const importCanvasSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  canvas: z.unknown(),
})

export interface CanvasAppOptions {
  authMode: AuthMode
  corsOrigin?: string
}

function entityTag(etag: string): string {
  return `"${etag}"`
}

function ifMatchValue(header: string | undefined): string | null {
  if (!header) return null
  const value = header.trim().replace(/^W\//, '').replace(/^"|"$/g, '')
  return value || null
}

function withEtag(c: Context, document: CanvasDocument, status: 200 | 201 = 200): Response {
  c.header('ETag', entityTag(document.etag))
  c.header('Cache-Control', 'no-store')
  return c.json(document, status)
}

export function createApp(store: CanvasStore, options: CanvasAppOptions): Hono {
  const app = new Hono()

  app.use(
    '*',
    cors({
      origin: options.corsOrigin ?? '*',
      allowMethods: ['GET', 'POST', 'PUT', 'OPTIONS'],
      allowHeaders: ['Authorization', 'Content-Type', 'If-Match'],
      exposeHeaders: ['ETag'],
      maxAge: 600,
    }),
  )

  app.get('/health', (c) => c.json({ status: 'ok' }))

  app.get('/v1/ontology', async (c) => {
    requireCanvasPrincipal(c, options.authMode)
    return c.json(await loadOntology())
  })

  app.get('/v1/canvases', async (c) => {
    const principal = requireCanvasPrincipal(c, options.authMode)
    const canvases = await store.list(principal.tenantId)
    return c.json({ canvases })
  })

  app.post('/v1/canvases', async (c) => {
    const principal = requireCanvasPrincipal(c, options.authMode)
    const body = await c.req.json().catch(() => null)
    const parsed = createCanvasSchema.safeParse(body ?? {})
    if (!parsed.success) {
      return c.json({ detail: 'Invalid canvas request.', errors: parsed.error.issues }, 400)
    }
    const document = await store.create(
      principal.tenantId,
      parsed.data.title ?? 'Untitled canvas',
      principal,
    )
    return withEtag(c, document, 201)
  })

  app.post('/v1/canvases/import', async (c) => {
    const principal = requireCanvasPrincipal(c, options.authMode)
    const body = await c.req.json().catch(() => null)
    const parsed = importCanvasSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ detail: 'Invalid canvas import.', errors: parsed.error.issues }, 400)
    }

    const validation = validateCanvas(normalizeImportedCanvas(parsed.data.canvas))
    if (!validation.ok) {
      return c.json({ detail: 'Invalid canvas.', errors: validation.errors }, 422)
    }
    if (canvasByteSize(validation.canvas) > MAX_CANVAS_BYTES) {
      return c.json({ detail: `Canvas exceeds ${MAX_CANVAS_BYTES} bytes.` }, 413)
    }

    const document = await store.create(
      principal.tenantId,
      parsed.data.title ?? 'Imported canvas',
      principal,
      validation.canvas,
    )
    return withEtag(c, document, 201)
  })

  app.get('/v1/canvases/:id/download', async (c) => {
    const principal = requireCanvasPrincipal(c, options.authMode)
    const document = await store.get(principal.tenantId, c.req.param('id'))
    if (!document) return c.json({ detail: 'Canvas not found.' }, 404)
    const filename = `${document.title.replace(/[^A-Za-z0-9 _-]/g, '').trim() || 'canvas'}.canvas`
    c.header('Content-Type', 'application/json; charset=utf-8')
    c.header('Content-Disposition', `attachment; filename="${filename}"`)
    c.header('Cache-Control', 'no-store')
    return c.body(`${JSON.stringify(document.canvas, null, 2)}\n`)
  })

  app.get('/v1/canvases/:id', async (c) => {
    const principal = requireCanvasPrincipal(c, options.authMode)
    const document = await store.get(principal.tenantId, c.req.param('id'))
    if (!document) return c.json({ detail: 'Canvas not found.' }, 404)
    return withEtag(c, document)
  })

  app.put('/v1/canvases/:id', async (c) => {
    const principal = requireCanvasPrincipal(c, options.authMode)
    const ifMatch = ifMatchValue(c.req.header('if-match'))
    if (!ifMatch) {
      return c.json({ detail: 'If-Match is required.' }, 428)
    }

    const body = await c.req.json().catch(() => null)
    const parsed = saveCanvasSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ detail: 'Invalid canvas request.', errors: parsed.error.issues }, 400)
    }

    const validation = validateCanvas(parsed.data.canvas)
    if (!validation.ok) {
      return c.json({ detail: 'Invalid canvas.', errors: validation.errors }, 422)
    }
    if (canvasByteSize(validation.canvas) > MAX_CANVAS_BYTES) {
      return c.json({ detail: `Canvas exceeds ${MAX_CANVAS_BYTES} bytes.` }, 413)
    }

    try {
      const document = await store.save(
        principal.tenantId,
        c.req.param('id'),
        validation.canvas,
        ifMatch,
        principal,
      )
      return withEtag(c, document)
    } catch (error) {
      if (error instanceof CanvasConflictError) {
        return c.json({
          detail: {
            code: 'canvas_conflict',
            latest: error.latest,
          },
        }, 412)
      }
      if (error instanceof CanvasNotFoundError) {
        return c.json({ detail: 'Canvas not found.' }, 404)
      }
      throw error
    }
  })

  app.notFound((c) => c.json({ detail: 'Not found.' }, 404))

  app.onError((error, c) => {
    if (error instanceof HTTPException) {
      return c.json({ detail: error.message }, error.status)
    }
    console.error(error)
    return c.json({ detail: 'Internal server error.' }, 500)
  })

  return app
}
