import { useCallback, useEffect, useRef, useState } from 'react'

export interface CanvasTrailEntry {
  id: string
  label: string
}

const CANVAS_PATH = /^\/canvas\/([^/]+)\/?$/

export function canvasIdFromPath(pathname: string): string | null {
  const match = CANVAS_PATH.exec(pathname)
  if (!match?.[1]) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

export function pathForTrail(trail: CanvasTrailEntry[]): string {
  const current = trail.at(-1)
  return current ? `/canvas/${encodeURIComponent(current.id)}` : '/'
}

function isTrail(value: unknown): value is CanvasTrailEntry[] {
  return Array.isArray(value) && value.every((entry) => (
    entry && typeof entry.id === 'string' && typeof entry.label === 'string'
  ))
}

/** History state keeps the full trail; a fresh deep link only knows the current canvas. */
function trailFromLocation(): CanvasTrailEntry[] {
  const state = window.history.state as { trail?: unknown } | null
  const id = canvasIdFromPath(window.location.pathname)
  if (isTrail(state?.trail) && state.trail.at(-1)?.id === (id ?? undefined)) return state.trail
  return id ? [{ id, label: '' }] : []
}

/** The open-canvas trail, mirrored to the URL so reload, links, and Back/Forward work. */
export function useCanvasTrail() {
  const [trail, setTrailState] = useState(trailFromLocation)
  const trailRef = useRef(trail)

  useEffect(() => {
    window.history.replaceState({ trail: trailRef.current }, '', pathForTrail(trailRef.current))
    const onPopState = () => {
      trailRef.current = trailFromLocation()
      setTrailState(trailRef.current)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const setTrail = useCallback((update: (current: CanvasTrailEntry[]) => CanvasTrailEntry[]) => {
    const current = trailRef.current
    const next = update(current)
    if (next === current) return
    const path = pathForTrail(next)
    if (path === window.location.pathname) window.history.replaceState({ trail: next }, '', path)
    else window.history.pushState({ trail: next }, '', path)
    trailRef.current = next
    setTrailState(next)
  }, [])

  return [trail, setTrail] as const
}
