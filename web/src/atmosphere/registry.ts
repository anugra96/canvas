import type { BackdropSceneId } from './scenes'

export interface ThemeDefinition {
  id: string
  label: string
  description: string
  themeColor: string
  scene?: BackdropSceneId
}

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
    scene: 'dune-night',
  },
  {
    id: 'dune-light',
    label: 'Dune Light',
    description: 'Blinding Arrakis noon',
    themeColor: '#f3e2bd',
    scene: 'dune-day',
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
    scene: 'ember',
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
    scene: 'tide',
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
    scene: 'void',
  },
  {
    id: 'aurora-shore',
    label: 'Aurora Shore',
    description: 'Black sand beach under northern lights',
    themeColor: '#06090b',
    scene: 'aurora-shore',
  },
] as const satisfies readonly ThemeDefinition[]

export type ThemeId = (typeof THEMES)[number]['id']

export function findTheme(id: string): (typeof THEMES)[number] | undefined {
  return THEMES.find((theme) => theme.id === id)
}

export function sceneForTheme(id: string): BackdropSceneId | null {
  const theme = findTheme(id)
  return theme && 'scene' in theme ? theme.scene : null
}
