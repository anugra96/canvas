import { useSyncExternalStore } from 'react'

const PREF_KEY = 'canvas-backdrop'
const listeners = new Set<() => void>()

function read(): boolean {
  try {
    if (localStorage.getItem(PREF_KEY) === 'off') return false
  } catch {
    // Storage unavailable; fall through to the default.
  }
  return true
}

let enabled = read()

export function setBackdropEnabled(value: boolean): void {
  enabled = value
  try {
    localStorage.setItem(PREF_KEY, value ? 'on' : 'off')
  } catch {
    // Storage unavailable; the in-memory preference still applies.
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function useBackdropEnabled(): boolean {
  return useSyncExternalStore(subscribe, () => enabled, () => true)
}
