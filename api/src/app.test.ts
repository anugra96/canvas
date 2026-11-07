import { describe, expect, it } from 'vitest'

import type { CanvasDocument, JsonCanvas } from '@canvas/contract'

import { createApp } from './app'
import { LOCAL_DEV_TOKEN } from './auth'
import { MemoryCanvasStore } from './store/memoryCanvasStore'

const authHeaders = {
  authorization: `Bearer ${LOCAL_DEV_TOKEN}`,
}

function canvasWithCard(text = 'Hello'): JsonCanvas {
  return {
    nodes: [
      {
        id: 'card-a',
        type: 'text',
        x: 0,
        y: 0,
        width: 320,
        height: 180,
        text,
      },
    ],
    edges: [],
  }
}

async function createCanvas(app: ReturnType<typeof createApp>): Promise<CanvasDocument> {
  const response = await app.request('/v1/canvases', {
    method: 'POST',
    headers: { ...authHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Fresh canvas' }),
  })
  expect(response.status).toBe(201)
  return response.json() as Promise<CanvasDocument>
}

describe('canvas API', () => {
  it('requires local authentication', async () => {
    const app = createApp(new MemoryCanvasStore(), { authMode: 'local' })
    const response = await app.request('/v1/canvases')
    expect(response.status).toBe(401)
  })

  it('serves the runtime ontology to authenticated users', async () => {
    const app = createApp(new MemoryCanvasStore(), { authMode: 'local' })
    const response = await app.request('/v1/ontology', { headers: authHeaders })
    expect(response.status).toBe(200)
    const ontology = await response.json() as { version: string; entityTypes: unknown[] }
    expect(ontology.version).toBe('1.0')
    expect(ontology.entityTypes.length).toBeGreaterThan(0)
    expect((await app.request('/v1/ontology')).status).toBe(401)
  })

  it('lists an empty canvas collection', async () => {
    const app = createApp(new MemoryCanvasStore(), { authMode: 'local' })
    const response = await app.request('/v1/canvases', { headers: authHeaders })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ canvases: [] })
  })

  it('creates, reads, saves, and lists a canvas', async () => {
    const app = createApp(new MemoryCanvasStore(), { authMode: 'local' })
    const created = await createCanvas(app)
    expect(created.title).toBe('Fresh canvas')
    expect(created.canvas).toEqual({ nodes: [], edges: [] })

    const read = await app.request(`/v1/canvases/${created.id}`, { headers: authHeaders })
    expect(read.status).toBe(200)
    expect(read.headers.get('etag')).toBe(`"${created.etag}"`)

    const saved = await app.request(`/v1/canvases/${created.id}`, {
      method: 'PUT',
      headers: {
        ...authHeaders,
        'content-type': 'application/json',
        'if-match': `"${created.etag}"`,
      },
      body: JSON.stringify({ canvas: canvasWithCard() }),
    })
    expect(saved.status).toBe(200)
    const savedDocument = await saved.json() as CanvasDocument
    expect(savedDocument.nodeCount).toBe(1)
    expect(savedDocument.etag).not.toBe(created.etag)

    const list = await app.request('/v1/canvases', { headers: authHeaders })
    expect(list.status).toBe(200)
    const body = await list.json() as { canvases: Array<{ id: string; nodeCount: number }> }
    expect(body.canvases).toHaveLength(1)
    expect(body.canvases[0]).toMatchObject({ id: created.id, nodeCount: 1 })
  })

  it('creates a Systems canvas with profile metadata', async () => {
    const app = createApp(new MemoryCanvasStore(), { authMode: 'local' })
    const response = await app.request('/v1/canvases', {
      method: 'POST',
      headers: { ...authHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Systems canvas', profile: 'systems' }),
    })
    expect(response.status).toBe(201)
    const document = await response.json() as CanvasDocument
    expect(document.canvas).toEqual({
      nodes: [],
      edges: [],
      app: { profile: 'systems', profileVersion: 2, scope: 'container' },
    })

    const list = await app.request('/v1/canvases', { headers: authHeaders })
    const body = await list.json() as { canvases: Array<{ id: string; profile: string }> }
    expect(body.canvases).toContainEqual(expect.objectContaining({
      id: document.id,
      profile: 'systems',
    }))
  })

  it('rejects an unknown canvas profile', async () => {
    const app = createApp(new MemoryCanvasStore(), { authMode: 'local' })
    const response = await app.request('/v1/canvases', {
      method: 'POST',
      headers: { ...authHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Unknown', profile: 'not-a-profile' }),
    })
    expect(response.status).toBe(400)
  })

  it('imports a complete canvas as a new native canvas', async () => {
    const app = createApp(new MemoryCanvasStore(), { authMode: 'local' })
    const response = await app.request('/v1/canvases/import', {
      method: 'POST',
      headers: { ...authHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Imported from Obsidian',
        canvas: canvasWithCard('Imported text'),
      }),
    })
    expect(response.status).toBe(201)
    const document = await response.json() as CanvasDocument
    expect(document.title).toBe('Imported from Obsidian')
    expect(document.nodeCount).toBe(1)
    expect(document.canvas.nodes?.[0]).toMatchObject({ text: 'Imported text' })

    const read = await app.request(`/v1/canvases/${document.id}`, { headers: authHeaders })
    expect(read.status).toBe(200)
    expect(await read.json()).toMatchObject({
      id: document.id,
      title: 'Imported from Obsidian',
      nodeCount: 1,
    })
  })

  it('rejects an invalid imported canvas', async () => {
    const app = createApp(new MemoryCanvasStore(), { authMode: 'local' })
    const response = await app.request('/v1/canvases/import', {
      method: 'POST',
      headers: { ...authHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({
        canvas: {
          nodes: [{ id: 'bad', type: 'text', x: 0, y: 0, width: 0, height: 10, text: 'bad' }],
          edges: [],
        },
      }),
    })
    expect(response.status).toBe(422)
  })

  it('returns the latest canvas on a stale save', async () => {
    const app = createApp(new MemoryCanvasStore(), { authMode: 'local' })
    const created = await createCanvas(app)

    const first = await app.request(`/v1/canvases/${created.id}`, {
      method: 'PUT',
      headers: {
        ...authHeaders,
        'content-type': 'application/json',
        'if-match': `"${created.etag}"`,
      },
      body: JSON.stringify({ canvas: canvasWithCard('First') }),
    })
    expect(first.status).toBe(200)

    const stale = await app.request(`/v1/canvases/${created.id}`, {
      method: 'PUT',
      headers: {
        ...authHeaders,
        'content-type': 'application/json',
        'if-match': `"${created.etag}"`,
      },
      body: JSON.stringify({ canvas: canvasWithCard('Stale') }),
    })
    expect(stale.status).toBe(412)
    const conflict = await stale.json() as {
      detail: { code: string; latest: CanvasDocument }
    }
    expect(conflict.detail.code).toBe('canvas_conflict')
    expect(conflict.detail.latest.canvas.nodes?.[0]).toMatchObject({ text: 'First' })
  })

  it('rejects an invalid canvas', async () => {
    const app = createApp(new MemoryCanvasStore(), { authMode: 'local' })
    const created = await createCanvas(app)
    const response = await app.request(`/v1/canvases/${created.id}`, {
      method: 'PUT',
      headers: {
        ...authHeaders,
        'content-type': 'application/json',
        'if-match': `"${created.etag}"`,
      },
      body: JSON.stringify({
        canvas: {
          nodes: [{ id: 'card-a', type: 'text', x: 0, y: 0, width: 0, height: 10, text: 'a' }],
          edges: [],
        },
      }),
    })
    expect(response.status).toBe(422)
  })

  it('downloads a valid obsidian canvas file', async () => {
    const app = createApp(new MemoryCanvasStore(), { authMode: 'local' })
    const created = await createCanvas(app)
    const saved = await app.request(`/v1/canvases/${created.id}`, {
      method: 'PUT',
      headers: {
        ...authHeaders,
        'content-type': 'application/json',
        'if-match': `"${created.etag}"`,
      },
      body: JSON.stringify({ canvas: canvasWithCard() }),
    })
    expect(saved.status).toBe(200)

    const download = await app.request(`/v1/canvases/${created.id}/download`, {
      headers: authHeaders,
    })
    expect(download.status).toBe(200)
    expect(download.headers.get('content-disposition')).toContain('Fresh canvas.canvas')
    expect(JSON.parse(await download.text())).toEqual(canvasWithCard())
  })
})
