import type { Viewport } from '@xyflow/react'

const KEY_PREFIX = 'canvas:viewport:v2:'

export type ViewportLayout = 'desktop' | 'mobile'

function key(canvasId: string, layout: ViewportLayout): string {
  return layout === 'mobile'
    ? `${KEY_PREFIX}mobile:${canvasId}`
    : `${KEY_PREFIX}${canvasId}`
}

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

export function readViewport(canvasId: string, layout: ViewportLayout = 'desktop'): Viewport | null {
  try {
    const raw = storage()?.getItem(key(canvasId, layout))
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<Viewport>
    if (typeof value.x !== 'number' || typeof value.y !== 'number' || typeof value.zoom !== 'number') {
      return null
    }
    if (!Number.isFinite(value.x) || !Number.isFinite(value.y) || !Number.isFinite(value.zoom) || value.zoom <= 0) {
      return null
    }
    return { x: value.x, y: value.y, zoom: value.zoom }
  } catch {
    return null
  }
}

export function writeViewport(canvasId: string, viewport: Viewport, layout: ViewportLayout = 'desktop'): void {
  try {
    storage()?.setItem(key(canvasId, layout), JSON.stringify(viewport))
  } catch {
    // Viewport persistence is best-effort.
  }
}
