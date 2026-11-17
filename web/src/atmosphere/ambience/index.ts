import type { AmbienceSpec, EnvStarter } from './engine'
import { applySafetyLimiter, setTuningReference } from './engine'
import {
  focusToneParams,
  startFocusLayer,
  type FocusDelivery,
  type FocusLayer,
  type FocusTone,
  type Tuning,
} from './focus'

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
const FOCUS_TONE_KEY = 'canvas-focus-tone'
const FOCUS_DELIVERY_KEY = 'canvas-focus-delivery'
const FOCUS_LEVEL_KEY = 'canvas-focus-level'
const TUNING_KEY = 'canvas-ambience-tuning'
const FOCUS_SESSION_MS = 60 * 60 * 1000

export const MAX_PLAYBACK_GAIN = 0.18

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
  playback?.setLevel(volumeLevel * MAX_PLAYBACK_GAIN)
}

export function readFocusTone(): FocusTone {
  try {
    const raw = localStorage.getItem(FOCUS_TONE_KEY)
    if (raw === 'off' || raw === 'alpha' || raw === 'beta' || raw === 'gamma') return raw
  } catch {
    // Storage unavailable; fall through to the default.
  }
  return 'off'
}

export function readFocusDelivery(): FocusDelivery {
  try {
    const raw = localStorage.getItem(FOCUS_DELIVERY_KEY)
    if (raw === 'binaural' || raw === 'isochronic') return raw
  } catch {
    // Storage unavailable; fall through to the default.
  }
  return 'binaural'
}

export function readFocusLevel(): number {
  try {
    const raw = localStorage.getItem(FOCUS_LEVEL_KEY)
    const value = raw == null ? Number.NaN : Number(raw)
    if (Number.isFinite(value)) return Math.min(1, Math.max(0, value))
  } catch {
    // Storage unavailable; fall through to the default.
  }
  return 0.4
}

export function readTuning(): Tuning {
  try {
    if (localStorage.getItem(TUNING_KEY) === '432') return 432
  } catch {
    // Storage unavailable; fall through to the default.
  }
  return 440
}

function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage unavailable; the in-memory value still applies.
  }
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

const bufferCache = new Map<string, Promise<AudioBuffer>>()

async function loadSpec(theme: AmbienceId): Promise<AmbienceSpec> {
  return loaders[theme]()
}

async function render(theme: AmbienceId, spec: AmbienceSpec, tuning: Tuning): Promise<AudioBuffer> {
  const context = new OfflineAudioContext(2, Math.ceil(44100 * spec.seconds), 44100)
  const previous = tuningLevel
  setTuningReference(tuning)
  try {
    spec.compose(context)
  } finally {
    setTuningReference(previous)
  }
  return context.startRendering()
}

function getBuffer(theme: AmbienceId, spec: AmbienceSpec, tuning: Tuning): Promise<AudioBuffer> {
  const key = `${theme}:${tuning}`
  const cached = bufferCache.get(key)
  if (cached) return cached
  const pending = render(theme, spec, tuning).catch((error) => {
    bufferCache.delete(key)
    throw error
  })
  bufferCache.set(key, pending)
  return pending
}

class Playback {
  private context: AudioContext
  private gain: GainNode
  private limiter: DynamicsCompressorNode
  private sceneSource: AudioBufferSourceNode | null = null
  private sceneLevel: GainNode | null = null
  private envStop: (() => void) | null = null
  private focus: FocusLayer | null = null
  private stopped = false

  constructor() {
    this.context = new AudioContext()
    this.gain = this.context.createGain()
    this.limiter = this.context.createDynamicsCompressor()
    applySafetyLimiter(this.limiter)
    this.gain.gain.setValueAtTime(0, this.context.currentTime)
    this.gain.connect(this.limiter)
    this.limiter.connect(this.context.destination)
    void this.context.resume().catch(() => undefined)
    this.gain.gain.linearRampToValueAtTime(volumeLevel * MAX_PLAYBACK_GAIN, this.context.currentTime + 1.4)
  }

  get hasFocus(): boolean {
    return this.focus !== null
  }

  setScene(buffer: AudioBuffer, env: EnvStarter, fadeIn: number): void {
    if (this.stopped) return
    this.clearScene(fadeIn)
    const now = this.context.currentTime
    const source = this.context.createBufferSource()
    const level = this.context.createGain()
    source.buffer = buffer
    source.loop = true
    level.gain.setValueAtTime(0, now)
    level.gain.linearRampToValueAtTime(1, now + Math.max(0.05, fadeIn))
    source.connect(level)
    level.connect(this.gain)
    source.start()
    this.sceneSource = source
    this.sceneLevel = level
    setTuningReference(tuningLevel)
    this.envStop = env(this.context, this.gain)
  }

  clearScene(fadeOut: number): void {
    const source = this.sceneSource
    const level = this.sceneLevel
    this.sceneSource = null
    this.sceneLevel = null
    this.envStop?.()
    this.envStop = null
    if (!source || !level) return
    const now = this.context.currentTime
    level.gain.cancelScheduledValues(now)
    level.gain.setValueAtTime(level.gain.value, now)
    level.gain.linearRampToValueAtTime(0, now + Math.max(0.05, fadeOut))
    source.stop(now + Math.max(0.05, fadeOut) + 0.05)
  }

  setFocus(
    tone: Exclude<FocusTone, 'off'>,
    delivery: FocusDelivery,
    level: number,
    fadeIn: number,
  ): void {
    if (this.stopped) return
    const params = focusToneParams(tone, delivery, tuningLevel)
    if (!params) return
    const previous = this.focus
    this.focus = startFocusLayer(this.context, this.gain, params, level, fadeIn)
    previous?.stop(3)
  }

  stopFocus(seconds: number): void {
    this.focus?.stop(seconds)
    this.focus = null
  }

  setFocusLevel(level: number): void {
    this.focus?.setLevel(level, 3)
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
    this.envStop = null
    this.stopFocus(2)
    const now = this.context.currentTime
    if (this.sceneLevel && this.sceneSource) {
      const level = this.sceneLevel
      const source = this.sceneSource
      level.gain.cancelScheduledValues(now)
      level.gain.setValueAtTime(level.gain.value, now)
      level.gain.linearRampToValueAtTime(0, now + 0.45)
      source.stop(now + 0.5)
    }
    this.sceneSource = null
    this.sceneLevel = null
    this.gain.gain.cancelScheduledValues(now)
    this.gain.gain.setValueAtTime(this.gain.gain.value, now)
    this.gain.gain.linearRampToValueAtTime(0, now + 0.45)
    window.setTimeout(() => {
      void this.context.close()
    }, 560)
  }
}

let generation = 0
let playback: Playback | null = null
let activeTheme: AmbienceId | '' = ''
let scenePending = false
let tuningLevel = readTuning()
setTuningReference(tuningLevel)
let focusTone = readFocusTone()
let focusDelivery = readFocusDelivery()
let focusLevel = readFocusLevel()
let focusPausedState = false
let focusTimer: number | null = null
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

export function focusPaused(): boolean {
  return focusPausedState
}

function ensurePlayback(): Playback {
  if (!playback) playback = new Playback()
  return playback
}

function clearFocusTimer(): void {
  if (focusTimer !== null) {
    window.clearTimeout(focusTimer)
    focusTimer = null
  }
}

function scheduleFocusPause(): void {
  clearFocusTimer()
  focusTimer = window.setTimeout(() => {
    focusTimer = null
    if (focusTone === 'off' || focusPausedState) return
    playback?.stopFocus(2)
    focusPausedState = true
    notifyAmbience()
  }, FOCUS_SESSION_MS)
}

function restartFocus(fadeIn?: number): void {
  if (focusTone === 'off' || focusPausedState) return
  const target = ensurePlayback()
  const wasPlaying = target.hasFocus
  target.setFocus(focusTone, focusDelivery, focusLevel, fadeIn ?? (wasPlaying ? 3 : 8))
  if (!wasPlaying) scheduleFocusPause()
}

export function setFocusTone(tone: FocusTone): void {
  focusTone = tone
  focusPausedState = false
  store(FOCUS_TONE_KEY, tone)
  notifyAmbience()
  if (tone === 'off') {
    clearFocusTimer()
    const target = playback
    if (!target) return
    target.stopFocus(2)
    window.setTimeout(() => {
      if (playback === target && !target.hasFocus && !activeTheme && !scenePending) {
        playback = null
        target.stop()
      }
    }, 2100)
    return
  }
  restartFocus()
}

export function setFocusDelivery(delivery: FocusDelivery): void {
  focusDelivery = delivery
  store(FOCUS_DELIVERY_KEY, delivery)
  notifyAmbience()
  if (playback?.hasFocus) restartFocus(3)
}

export function setFocusLevel(level: number): void {
  focusLevel = Math.min(1, Math.max(0, level))
  store(FOCUS_LEVEL_KEY, String(focusLevel))
  notifyAmbience()
  playback?.setFocusLevel(focusLevel)
}

export function resumeFocus(): void {
  if (focusTone === 'off') return
  focusPausedState = false
  notifyAmbience()
  restartFocus(8)
}

export async function setAmbienceTuning(tuning: Tuning): Promise<void> {
  if (tuning === tuningLevel) return
  tuningLevel = tuning
  setTuningReference(tuning)
  store(TUNING_KEY, String(tuning))
  notifyAmbience()
  if (playback?.hasFocus) restartFocus(3)
  const theme = activeTheme
  if (!theme) return
  const token = ++generation
  const target = playback
  if (!target) return
  const spec = await loadSpec(theme)
  const buffer = await getBuffer(theme, spec, tuning)
  if (token !== generation || playback !== target) return
  target.setScene(buffer, spec.env, 3)
}

export async function startAmbience(theme: AmbienceId): Promise<void> {
  const token = ++generation
  const target = ensurePlayback()
  scenePending = true
  target.clearScene(0.8)
  activeTheme = ''
  notifyAmbience()
  try {
    const spec = await loadSpec(theme)
    let requested = tuningLevel
    let buffer = await getBuffer(theme, spec, requested)
    while (token === generation && playback === target && requested !== tuningLevel) {
      requested = tuningLevel
      buffer = await getBuffer(theme, spec, requested)
    }
    if (token !== generation || playback !== target) return
    target.setScene(buffer, spec.env, 1.4)
    activeTheme = theme
    scenePending = false
    notifyAmbience()
  } catch (error) {
    if (token === generation && playback === target) {
      scenePending = false
      if (!target.hasFocus && !activeTheme) {
        playback = null
        target.stop()
      }
    }
    throw error
  }
}

export function stopAmbience(): void {
  generation += 1
  scenePending = false
  activeTheme = ''
  notifyAmbience()
  const target = playback
  if (!target) return
  target.clearScene(0.45)
  if (!target.hasFocus) {
    playback = null
    target.stop()
  }
}
