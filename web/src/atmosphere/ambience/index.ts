import type { AmbienceSpec, EnvStarter } from './engine'

export const AMBIENCES = [
  {
    id: 'space',
    label: 'Space sci-fi',
    description: 'A 32-second orbital theme with slow pads and distant signals.',
  },
  {
    id: 'cyberpunk',
    label: 'Cyberpunk',
    description: 'A 40-second circuit theme with bass, pulse and neon arpeggios.',
  },
  {
    id: 'dune',
    label: 'Dune',
    description: 'A 37-second desert theme with evolving wind, sub drone, frame drums and a metallic motif.',
  },
  {
    id: 'medieval-scifi',
    label: 'Medieval sci-fi',
    description: 'A 34-second modal theme with plucked strings and a machine hum.',
  },
  {
    id: 'moss',
    label: 'Moss Circuit',
    description: 'A 33-second forest-floor theme with soft square arps over deep pads.',
  },
  {
    id: 'tide',
    label: 'Tide Signal',
    description: 'A 36-second sonar theme with distant pings over an ocean drone.',
  },
  {
    id: 'lantern',
    label: 'Paper Lanterns',
    description: 'A 36-second warm theme with a plucked melody over tape hiss.',
  },
  {
    id: 'aurora',
    label: 'Aurora Terminal',
    description: 'A 38-second night-terminal theme with neon arps and a sub pulse.',
  },
  {
    id: 'rain',
    label: 'Copper Rain',
    description: 'A 40-second rain theme with metallic plinks over warm pads.',
  },
  {
    id: 'nightbus',
    label: 'Night Bus',
    description: 'A 37-second night-drive theme with engine rumble and distant chimes.',
  },
  {
    id: 'meadow',
    label: 'Glass Meadow',
    description: 'A 36-second morning theme with bright plucks over soft wind.',
  },
  {
    id: 'vapor',
    label: 'Vapor Line',
    description: 'A 40-second late-night theme with slow pads and a neon pulse.',
  },
] as const

export type AmbienceId = (typeof AMBIENCES)[number]['id']

export function isAmbienceId(value: string): value is AmbienceId {
  return AMBIENCES.some((ambience) => ambience.id === value)
}

const AMBIENCE_VOLUME_KEY = 'canvas-ambience-volume'
const MAX_PLAYBACK_GAIN = 0.18

export function readVolume(): number {
  try {
    const raw = localStorage.getItem(AMBIENCE_VOLUME_KEY)
    const value = raw == null ? Number.NaN : Number(raw)
    if (Number.isFinite(value)) return Math.min(1, Math.max(0, value))
  } catch {
    // Storage unavailable; fall through to the default.
  }
  return 0.8
}

let volumeLevel = readVolume()

export function setAmbienceVolume(value: number): void {
  volumeLevel = Math.min(1, Math.max(0, value))
  try {
    localStorage.setItem(AMBIENCE_VOLUME_KEY, String(volumeLevel))
  } catch {
    // Storage unavailable; the in-memory level still applies.
  }
  current?.setLevel(volumeLevel * MAX_PLAYBACK_GAIN)
}

const loaders: Record<AmbienceId, () => Promise<AmbienceSpec>> = {
  'space': () => import('./space').then((module) => module.spaceSpec),
  'cyberpunk': () => import('./cyberpunk').then((module) => module.cyberpunkSpec),
  'dune': () => import('./dune').then((module) => module.duneSpec),
  'medieval-scifi': () => import('./medieval').then((module) => module.medievalSpec),
  'moss': () => import('./moss').then((module) => module.mossSpec),
  'tide': () => import('./tide').then((module) => module.tideSpec),
  'lantern': () => import('./lantern').then((module) => module.lanternSpec),
  'aurora': () => import('./aurora').then((module) => module.auroraSpec),
  'rain': () => import('./rain').then((module) => module.rainSpec),
  'nightbus': () => import('./nightbus').then((module) => module.nightbusSpec),
  'meadow': () => import('./meadow').then((module) => module.meadowSpec),
  'vapor': () => import('./vapor').then((module) => module.vaporSpec),
}

const bufferCache = new Map<AmbienceId, Promise<AudioBuffer>>()

async function loadSpec(theme: AmbienceId): Promise<AmbienceSpec> {
  return loaders[theme]()
}

async function render(theme: AmbienceId, spec: AmbienceSpec): Promise<AudioBuffer> {
  const context = new OfflineAudioContext(2, Math.ceil(44100 * spec.seconds), 44100)
  spec.compose(context)
  return context.startRendering()
}

function getBuffer(theme: AmbienceId, spec: AmbienceSpec): Promise<AudioBuffer> {
  const cached = bufferCache.get(theme)
  if (cached) return cached
  const pending = render(theme, spec).catch((error) => {
    bufferCache.delete(theme)
    throw error
  })
  bufferCache.set(theme, pending)
  return pending
}

class Playback {
  private context: AudioContext
  private gain: GainNode
  private source: AudioBufferSourceNode
  private envStop: (() => void) | null = null
  private stopped = false

  constructor(buffer: AudioBuffer, env?: EnvStarter) {
    this.context = new AudioContext()
    this.gain = this.context.createGain()
    this.gain.gain.setValueAtTime(0, this.context.currentTime)
    this.gain.connect(this.context.destination)
    this.source = this.context.createBufferSource()
    this.source.buffer = buffer
    this.source.loop = true
    this.source.connect(this.gain)
    void this.context.resume()
    this.source.start()
    this.gain.gain.linearRampToValueAtTime(volumeLevel * MAX_PLAYBACK_GAIN, this.context.currentTime + 1.4)
    if (env) {
      this.envStop = env(this.context, this.gain)
    }
  }

  setLevel(level: number): void {
    if (this.stopped) return
    const now = this.context.currentTime
    this.gain.gain.cancelScheduledValues(now)
    this.gain.gain.setValueAtTime(this.gain.gain.value, now)
    this.gain.gain.linearRampToValueAtTime(level, now + 0.3)
  }

  stop(): void {
    if (this.stopped) return
    this.stopped = true
    this.envStop?.()
    const now = this.context.currentTime
    this.gain.gain.cancelScheduledValues(now)
    this.gain.gain.setValueAtTime(this.gain.gain.value, now)
    this.gain.gain.linearRampToValueAtTime(0, now + 0.45)
    this.source.stop(now + 0.5)
    window.setTimeout(() => {
      void this.context.close()
    }, 560)
  }
}

let generation = 0
let current: Playback | null = null
let activeTheme: AmbienceId | '' = ''
const ambienceListeners = new Set<() => void>()

function notifyAmbience(): void {
  for (const listener of ambienceListeners) listener()
}

export function subscribeAmbience(listener: () => void): () => void {
  ambienceListeners.add(listener)
  return () => { ambienceListeners.delete(listener) }
}

export function currentAmbience(): AmbienceId | '' {
  return activeTheme
}

export async function startAmbience(theme: AmbienceId): Promise<void> {
  const token = ++generation
  current?.stop()
  current = null
  activeTheme = ''
  notifyAmbience()
  const spec = await loadSpec(theme)
  const buffer = await getBuffer(theme, spec)
  if (token !== generation) return
  current = new Playback(buffer, spec.env)
  activeTheme = theme
  notifyAmbience()
}

export function stopAmbience(): void {
  generation += 1
  current?.stop()
  current = null
  activeTheme = ''
  notifyAmbience()
}
