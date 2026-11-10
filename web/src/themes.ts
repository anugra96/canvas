import { useSyncExternalStore } from 'react'

export const THEME_STORAGE_KEY = 'canvas-theme'

export const THEMES = [
  {
    id: 'graphite',
    label: 'Graphite',
    description: 'Cool graphite',
    themeColor: '#0b0d10',
  },
  {
    id: 'paper',
    label: 'Paper',
    description: 'Clean daylight',
    themeColor: '#f4f1ea',
  },
  {
    id: 'dune',
    label: 'Dune',
    description: 'Spice dark, Arrakis night',
    themeColor: '#0e0a06',
  },
  {
    id: 'dune-light',
    label: 'Dune Light',
    description: 'Blinding Arrakis noon',
    themeColor: '#f3e2bd',
  },
  {
    id: 'abyss',
    label: 'Abyss',
    description: 'Deep teal',
    themeColor: '#061014',
  },
  {
    id: 'ember',
    label: 'Ember',
    description: 'Warm charcoal',
    themeColor: '#120e0b',
  },
  {
    id: 'kelp',
    label: 'Kelp',
    description: 'Deep forest green',
    themeColor: '#0c120e',
  },
  {
    id: 'glacier',
    label: 'Glacier',
    description: 'Cool blue daylight',
    themeColor: '#e9eef2',
  },
  {
    id: 'plum',
    label: 'Plum',
    description: 'Muted violet dusk',
    themeColor: '#100d13',
  },
  {
    id: 'lagoon',
    label: 'Lagoon',
    description: 'Bright aqua daylight',
    themeColor: '#e4f0ee',
  },
  {
    id: 'cinder',
    label: 'Cinder',
    description: 'Embered charcoal red',
    themeColor: '#140c0a',
  },
  {
    id: 'dusk',
    label: 'Dusk',
    description: 'Deep indigo night',
    themeColor: '#0c0e18',
  },
  {
    id: 'fern',
    label: 'Fern',
    description: 'Fresh spring green',
    themeColor: '#e9f2e2',
  },
  {
    id: 'marigold',
    label: 'Marigold',
    description: 'Golden orange daylight',
    themeColor: '#f7e8c9',
  },
  {
    id: 'clay',
    label: 'Clay',
    description: 'Warm terracotta earth',
    themeColor: '#f2ddd0',
  },
  {
    id: 'blossom',
    label: 'Blossom',
    description: 'Soft cherry daylight',
    themeColor: '#f7ecec',
  },
  {
    id: 'tide',
    label: 'Tide',
    description: 'Deep ocean with coral',
    themeColor: '#0a1622',
  },
  {
    id: 'sunset',
    label: 'Sunset',
    description: 'Violet dusk, amber glow',
    themeColor: '#1a1024',
  },
  {
    id: 'gargantua',
    label: 'Gargantua',
    description: 'Black-hole dark',
    themeColor: '#050608',
  },
  {
    id: 'aurora-shore',
    label: 'Aurora Shore',
    description: 'Black sand beach under northern lights',
    themeColor: '#06090b',
  },
] as const

export type ThemeId = (typeof THEMES)[number]['id']

export const DEFAULT_THEME: ThemeId = 'graphite'

const themeListeners = new Set<() => void>()

export function isThemeId(value: string): value is ThemeId {
  return THEMES.some((theme) => theme.id === value)
}

export function readTheme(): ThemeId {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY)
    return value && isThemeId(value) ? value : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

export function getTheme(): ThemeId {
  const value = document.documentElement.dataset.theme
  return value && isThemeId(value) ? value : DEFAULT_THEME
}

export function subscribeTheme(listener: () => void): () => void {
  themeListeners.add(listener)
  return () => { themeListeners.delete(listener) }
}

export function applyTheme(theme: ThemeId): void {
  document.documentElement.dataset.theme = theme
  const definition = THEMES.find((candidate) => candidate.id === theme) ?? THEMES[0]
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
