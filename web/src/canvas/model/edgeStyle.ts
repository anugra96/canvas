import { useSyncExternalStore } from 'react'

export const EDGE_STYLES = [
  { id: 'bezier', label: 'Bezier' },
  { id: 'straight', label: 'Straight' },
  { id: 'step', label: 'Step' },
  { id: 'smoothstep', label: 'Smooth step' },
] as const

export type EdgeStyle = (typeof EDGE_STYLES)[number]['id']

const EDGE_STYLE_STORAGE_KEY = 'canvas-edge-style'
const DEFAULT_EDGE_STYLE: EdgeStyle = 'bezier'

const listeners = new Set<() => void>()
let current = read()

function isEdgeStyle(value: string): value is EdgeStyle {
  return EDGE_STYLES.some((style) => style.id === value)
}

function read(): EdgeStyle {
  try {
    const value = localStorage.getItem(EDGE_STYLE_STORAGE_KEY)
    return value && isEdgeStyle(value) ? value : DEFAULT_EDGE_STYLE
  } catch {
    return DEFAULT_EDGE_STYLE
  }
}

function getEdgeStyle(): EdgeStyle {
  return current
}

export function setEdgeStyle(style: EdgeStyle): void {
  current = style
  try {
    localStorage.setItem(EDGE_STYLE_STORAGE_KEY, style)
  } catch {
    // The in-memory setting still applies.
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function useEdgeStyle(): EdgeStyle {
  return useSyncExternalStore(subscribe, getEdgeStyle, () => DEFAULT_EDGE_STYLE)
}
