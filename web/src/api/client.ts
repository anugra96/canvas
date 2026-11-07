import type {
  CanvasDocument,
  CanvasSummary,
  JsonCanvas,
} from '@canvas/contract'

import type { CanvasSession } from '../auth/auth'
import { CanvasConflictError } from './errors'
import { createMockCanvasClient } from './mockClient'

export { CanvasConflictError } from './errors'

export interface CanvasClient {
  listCanvases(): Promise<CanvasSummary[]>
  createCanvas(title?: string, profile?: string): Promise<CanvasDocument>
  importCanvas(title: string, canvas: JsonCanvas): Promise<CanvasDocument>
  getCanvas(id: string): Promise<CanvasDocument>
  saveCanvas(id: string, etag: string, canvas: JsonCanvas): Promise<CanvasDocument>
  downloadCanvas(id: string, title: string): Promise<void>
}

function apiBaseUrl(): string {
  return (import.meta.env.VITE_CANVAS_API_BASE_URL ?? '').replace(/\/$/, '')
}

async function errorFrom(response: Response): Promise<Error> {
  const body = await response.json().catch(() => null) as {
    detail?: string | { code?: string; latest?: CanvasDocument }
  } | null
  const detail = body?.detail
  if (response.status === 412 && detail && typeof detail === 'object'
    && detail.code === 'canvas_conflict' && detail.latest) {
    return new CanvasConflictError(detail.latest)
  }
  return new Error(typeof detail === 'string' ? detail : `Request failed with ${response.status}.`)
}

function createApiClient(session: CanvasSession): CanvasClient {
  const headers = (extra?: HeadersInit): HeadersInit => ({
    authorization: `Bearer ${session.idToken}`,
    ...extra,
  })
  const request = (path: string, init?: RequestInit) => fetch(`${apiBaseUrl()}${path}`, init)

  return {
    async listCanvases() {
      const response = await request('/v1/canvases', { headers: headers() })
      if (!response.ok) throw await errorFrom(response)
      const body = await response.json() as { canvases: CanvasSummary[] }
      return body.canvases
    },

    async createCanvas(title, profile) {
      const response = await request('/v1/canvases', {
        method: 'POST',
        headers: headers({ 'content-type': 'application/json' }),
        body: JSON.stringify({ title, profile }),
      })
      if (!response.ok) throw await errorFrom(response)
      return response.json() as Promise<CanvasDocument>
    },

    async importCanvas(title, canvas) {
      const response = await request('/v1/canvases/import', {
        method: 'POST',
        headers: headers({ 'content-type': 'application/json' }),
        body: JSON.stringify({ title, canvas }),
      })
      if (!response.ok) throw await errorFrom(response)
      return response.json() as Promise<CanvasDocument>
    },

    async getCanvas(id) {
      const response = await request(`/v1/canvases/${id}`, { headers: headers() })
      if (!response.ok) throw await errorFrom(response)
      return response.json() as Promise<CanvasDocument>
    },

    async saveCanvas(id, etag, canvas) {
      const response = await request(`/v1/canvases/${id}`, {
        method: 'PUT',
        headers: headers({
          'content-type': 'application/json',
          'if-match': `"${etag}"`,
        }),
        body: JSON.stringify({ canvas }),
      })
      if (!response.ok) throw await errorFrom(response)
      return response.json() as Promise<CanvasDocument>
    },

    async downloadCanvas(id, title) {
      const response = await request(`/v1/canvases/${id}/download`, { headers: headers() })
      if (!response.ok) throw await errorFrom(response)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${title || 'canvas'}.canvas`
      anchor.click()
      URL.revokeObjectURL(url)
    },
  }
}

export function createCanvasClient(session: CanvasSession): CanvasClient {
  const useMockApi = import.meta.env.MODE === 'test'
    || import.meta.env.VITE_CANVAS_USE_MOCK_API === 'true'
  return useMockApi ? createMockCanvasClient(session) : createApiClient(session)
}
