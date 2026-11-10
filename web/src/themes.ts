import { useSyncExternalStore } from 'react'

import { findTheme, THEMES, type ThemeId } from './atmosphere/registry'

export { THEMES }
export type { ThemeId }

const THEME_STORAGE_KEY = 'canvas-theme'
const DEFAULT_THEME: ThemeId = 'graphite'
const themeListeners = new Set<() => void>()

function isThemeId(value: string): value is ThemeId {
  return THEMES.some((theme) => theme.id === value)
}

function readTheme(): ThemeId {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY)
    return value && isThemeId(value) ? value : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

function getTheme(): ThemeId {
  const value = document.documentElement.dataset.theme
  return value && isThemeId(value) ? value : DEFAULT_THEME
}

function subscribeTheme(listener: () => void): () => void {
  themeListeners.add(listener)
  return () => { themeListeners.delete(listener) }
}

function applyTheme(theme: ThemeId): void {
  document.documentElement.dataset.theme = theme
  const definition = findTheme(theme) ?? THEMES[0]
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', definition.themeColor)
  for (const listener of themeListeners) listener()
}

export function setTheme(theme: ThemeId): void {
  applyTheme(theme)
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    return
  }
}

export function initializeTheme(): void {
  applyTheme(readTheme())
}

export function useTheme(): ThemeId {
  return useSyncExternalStore(subscribeTheme, getTheme, () => DEFAULT_THEME)
}
