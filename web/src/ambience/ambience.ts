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

export const AMBIENCE_VOLUME_KEY = 'canvas-ambience-volume'
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

function midiToHz(note: number): number {
  return 440 * 2 ** ((note - 69) / 12)
}

interface ToneOptions {
  type?: OscillatorType
  gain?: number
  attack?: number
  release?: number
  detune?: number
  pan?: number
}

function tone(
  context: BaseAudioContext,
  destination: AudioNode,
  note: number,
  start: number,
  hold: number,
  options: ToneOptions = {},
): void {
  const {
    type = 'sine',
    gain = 0.03,
    attack = 0.02,
    release = 0.4,
    detune = 0,
    pan = 0,
  } = options
  const osc = context.createOscillator()
  const level = context.createGain()
  const panner = context.createStereoPanner()
  osc.type = type
  osc.frequency.value = midiToHz(note)
  osc.detune.value = detune
  panner.pan.value = pan
  level.gain.setValueAtTime(0, start)
  level.gain.linearRampToValueAtTime(gain, start + attack)
  level.gain.setValueAtTime(gain, start + hold)
  level.gain.exponentialRampToValueAtTime(0.0001, start + hold + release)
  osc.connect(level)
  level.connect(panner)
  panner.connect(destination)
  osc.start(start)
  osc.stop(start + hold + release + 0.05)
}

function noise(
  context: BaseAudioContext,
  destination: AudioNode,
  buffer: AudioBuffer,
  start: number,
  duration: number,
  filterType: BiquadFilterType,
  frequency: number,
  gain: number,
  pan = 0,
): void {
  const source = context.createBufferSource()
  const filter = context.createBiquadFilter()
  const level = context.createGain()
  const panner = context.createStereoPanner()
  source.buffer = buffer
  source.loop = true
  filter.type = filterType
  filter.frequency.value = frequency
  filter.Q.value = 0.6
  level.gain.setValueAtTime(0, start)
  level.gain.linearRampToValueAtTime(gain, start + 0.8)
  level.gain.setValueAtTime(gain, Math.max(start + 0.8, start + duration - 1))
  level.gain.linearRampToValueAtTime(0, start + duration)
  panner.pan.value = pan
  source.connect(filter)
  filter.connect(level)
  level.connect(panner)
  panner.connect(destination)
  source.start(start)
  source.stop(start + duration + 0.05)
}

function noiseBuffer(context: BaseAudioContext): AudioBuffer {
  const length = Math.ceil(context.sampleRate * 2)
  const buffer = context.createBuffer(1, length, context.sampleRate)
  const channel = buffer.getChannelData(0)
  for (let index = 0; index < length; index += 1) {
    channel[index] = Math.random() * 2 - 1
  }
  return buffer
}

function echo(
  context: BaseAudioContext,
  destination: AudioNode,
  delayTime: number,
  feedback: number,
  wet: number,
): GainNode {
  const input = context.createGain()
  const delay = context.createDelay(2)
  const feedbackGain = context.createGain()
  const wetGain = context.createGain()
  delay.delayTime.value = delayTime
  feedbackGain.gain.value = feedback
  wetGain.gain.value = wet
  input.connect(delay)
  delay.connect(feedbackGain)
  feedbackGain.connect(delay)
  delay.connect(wetGain)
  wetGain.connect(destination)
  return input
}

type EnvStarter = (context: AudioContext, master: GainNode) => () => void

function gliss(
  context: AudioContext,
  destination: AudioNode,
  at: number,
  from: number,
  to: number,
  duration: number,
  type: OscillatorType,
  gain: number,
  pan = 0,
): void {
  const osc = context.createOscillator()
  const level = context.createGain()
  const panner = context.createStereoPanner()
  osc.type = type
  osc.frequency.setValueAtTime(Math.max(20, from), at)
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + duration)
  level.gain.setValueAtTime(0, at)
  level.gain.linearRampToValueAtTime(gain, at + 0.05)
  level.gain.exponentialRampToValueAtTime(0.0001, at + duration)
  panner.pan.value = pan
  osc.connect(level)
  level.connect(panner)
  panner.connect(destination)
  osc.start(at)
  osc.stop(at + duration + 0.05)
}

function bell(
  context: AudioContext,
  destination: AudioNode,
  at: number,
  note: number,
  gain: number,
): void {
  tone(context, destination, note, at, 1.5, {
    type: 'sine',
    gain,
    attack: 0.01,
    release: 3,
  })
  tone(context, destination, note + 12, at, 1.2, {
    type: 'sine',
    gain: gain * 0.4,
    attack: 0.01,
    release: 2.5,
  })
}

function liveBurst(
  context: AudioContext,
  destination: AudioNode,
  buffer: AudioBuffer,
  at: number,
  duration: number,
  filterType: BiquadFilterType,
  frequency: number,
  gain: number,
  pan = 0,
  attack = 0.03,
): void {
  const source = context.createBufferSource()
  const filter = context.createBiquadFilter()
  const level = context.createGain()
  const panner = context.createStereoPanner()
  source.buffer = buffer
  source.loop = true
  filter.type = filterType
  filter.frequency.value = frequency
  filter.Q.value = 0.8
  level.gain.setValueAtTime(0, at)
  level.gain.linearRampToValueAtTime(gain, at + attack)
  level.gain.exponentialRampToValueAtTime(0.0001, at + duration)
  panner.pan.value = pan
  source.connect(filter)
  filter.connect(level)
  level.connect(panner)
  panner.connect(destination)
  source.start(at)
  source.stop(at + duration + 0.1)
}

function liveBed(
  context: AudioContext,
  destination: AudioNode,
  buffer: AudioBuffer,
  filterType: BiquadFilterType,
  frequency: number,
  gain: number,
  pan = 0,
): () => void {
  const source = context.createBufferSource()
  const filter = context.createBiquadFilter()
  const level = context.createGain()
  const panner = context.createStereoPanner()
  source.buffer = buffer
  source.loop = true
  filter.type = filterType
  filter.frequency.value = frequency
  filter.Q.value = 0.6
  level.gain.setValueAtTime(0, context.currentTime)
  level.gain.linearRampToValueAtTime(gain, context.currentTime + 2.5)
  panner.pan.value = pan
  source.connect(filter)
  filter.connect(level)
  level.connect(panner)
  panner.connect(destination)
  source.start()
  return () => {
    const now = context.currentTime
    level.gain.cancelScheduledValues(now)
    level.gain.setValueAtTime(level.gain.value, now)
    level.gain.linearRampToValueAtTime(0, now + 0.8)
    source.stop(now + 1)
  }
}

function liveDrone(
  context: AudioContext,
  destination: AudioNode,
  note: number,
  gain: number,
  type: OscillatorType = 'sine',
  pan = 0,
): () => void {
  const osc = context.createOscillator()
  const level = context.createGain()
  const panner = context.createStereoPanner()
  osc.type = type
  osc.frequency.value = midiToHz(note)
  level.gain.setValueAtTime(0, context.currentTime)
  level.gain.linearRampToValueAtTime(gain, context.currentTime + 3)
  panner.pan.value = pan
  osc.connect(level)
  level.connect(panner)
  panner.connect(destination)
  osc.start()
  return () => {
    const now = context.currentTime
    level.gain.cancelScheduledValues(now)
    level.gain.setValueAtTime(level.gain.value, now)
    level.gain.linearRampToValueAtTime(0, now + 0.8)
    osc.stop(now + 1)
  }
}

function every(
  context: AudioContext,
  minGap: number,
  maxGap: number,
  voice: (at: number) => void,
): () => void {
  let stopped = false
  let timer = 0
  const schedule = (): void => {
    if (stopped) return
    const delay = minGap + Math.random() * (maxGap - minGap)
    timer = window.setTimeout(() => {
      if (stopped) return
      voice(context.currentTime + 0.05)
      schedule()
    }, delay * 1000)
  }
  schedule()
  return () => {
    stopped = true
    window.clearTimeout(timer)
  }
}

function createMaster(context: BaseAudioContext): GainNode {
  const master = context.createGain()
  const highpass = context.createBiquadFilter()
  const compressor = context.createDynamicsCompressor()
  master.gain.value = 0.52
  highpass.type = 'highpass'
  highpass.frequency.value = 58
  highpass.Q.value = 0.7
  compressor.threshold.value = -22
  compressor.knee.value = 24
  compressor.ratio.value = 2
  compressor.attack.value = 0.01
  compressor.release.value = 0.3
  master.connect(highpass)
  highpass.connect(compressor)
  compressor.connect(context.destination)
  return master
}

function composeSpace(context: OfflineAudioContext): void {
  const master = createMaster(context)
  const send = echo(context, master, 0.62, 0.34, 0.55)
  const ambience = noiseBuffer(context)
  const bar = (60 / 58) * 4
  const chords = [[50, 53, 57], [46, 50, 53], [41, 45, 48], [48, 52, 55]]
  const melody = [74, 77, 81, 77, 72, 74, 77, 69]

  noise(context, master, ambience, 0, bar * 8, 'lowpass', 720, 0.035, -0.25)
  // Station hum: a constant low bed for the whole loop.
  tone(context, master, 31, 0, bar * 8, {
    type: 'sine',
    gain: 0.008,
    attack: 2.5,
    release: 2.5,
  })
  for (let chordIndex = 0; chordIndex < chords.length; chordIndex += 1) {
    const start = chordIndex * bar * 2
    const chord = chords[chordIndex]!
    for (const [index, note] of chord.entries()) {
      tone(context, master, note, start, bar * 1.85, {
        type: 'sine',
        gain: 0.038,
        attack: 1.4,
        release: 2.2,
        detune: index === 1 ? 5 : -4,
        pan: (index - 1) * 0.32,
      })
    }
    tone(context, master, chord[0]! - 12, start, bar * 1.8, {
      type: 'sine',
      gain: 0.042,
      attack: 0.9,
      release: 2,
    })
    tone(context, master, chord[0]! - 24, start, bar * 1.8, {
      type: 'sine',
      gain: 0.028,
      attack: 1.6,
      release: 2.4,
    })
    for (let beat = 0; beat < 8; beat += 1) {
      const beatStart = start + beat * (bar / 4)
      if (beat === 0) {
        // Soft heartbeat pulse on every downbeat.
        tone(context, master, chord[0]! - 12, beatStart, 0.3, {
          type: 'sine',
          gain: 0.03,
          attack: 0.02,
          release: 0.6,
        })
      }
      if (chordIndex % 2 === 0 && beat === 0) {
        tone(context, send, melody[(chordIndex + beat) % melody.length]!, beatStart, 0.4, {
          type: 'sine',
          gain: 0.025,
          attack: 0.03,
          release: 1.4,
          pan: 0.3,
        })
      }
      if (beat === 2 || beat === 6) {
        tone(context, send, melody[(chordIndex + beat + 3) % melody.length]! + 12, beatStart, 0.25, {
          type: 'triangle',
          gain: 0.012,
          attack: 0.02,
          release: 1.6,
          pan: beat === 2 ? -0.35 : 0.35,
        })
      }
      if (beat === 4) {
        tone(context, send, melody[(chordIndex + beat) % melody.length]! + 24, beatStart, 0.2, {
          type: 'sine',
          gain: 0.009,
          attack: 0.02,
          release: 1.8,
          pan: -0.2,
        })
      }
    }
  }
}

function composeCyberpunk(context: OfflineAudioContext): void {
  const master = createMaster(context)
  const send = echo(context, master, 0.18, 0.28, 0.4)
  const ambience = noiseBuffer(context)
  const bar = (60 / 96) * 4
  const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
  const roots = [45, 41, 36, 43]

  noise(context, master, ambience, 0, bar * 16, 'bandpass', 2600, 0.012, 0.2)
  for (let barIndex = 0; barIndex < 16; barIndex += 1) {
    const chord = chords[barIndex % chords.length]!
    const root = roots[barIndex % roots.length]!
    const start = barIndex * bar
    const lift = barIndex % 4 === 3 ? 12 : 0
    for (const [index, note] of chord.entries()) {
      tone(context, master, note + lift, start, bar * 0.9, {
        type: 'sawtooth',
        gain: 0.012,
        attack: 0.25,
        release: 0.9,
        detune: index === 0 ? -6 : 6,
        pan: (index - 1) * 0.25,
      })
    }
    // Sub bass following the root an octave down.
    tone(context, master, root - 12, start, bar * 0.9, {
      type: 'sine',
      gain: 0.026,
      attack: 0.05,
      release: 0.5,
    })
    for (let eighth = 0; eighth < 8; eighth += 1) {
      const note = eighth % 2 === 0 ? root : root + 12
      tone(context, master, note, start + eighth * (bar / 8), 0.12, {
        type: 'square',
        gain: eighth % 2 === 0 ? 0.018 : 0.013,
        attack: 0.005,
        release: 0.14,
      })
      const arpNote = chord[(barIndex + eighth) % chord.length]! + 12 + lift
      tone(context, send, arpNote, start + eighth * (bar / 8), 0.08, {
        type: 'square',
        gain: 0.009,
        attack: 0.004,
        release: 0.2,
        detune: eighth % 2 === 0 ? 4 : -4,
        pan: eighth % 2 === 0 ? 0.25 : -0.25,
      })
    }
    for (let beat = 0; beat < 4; beat += 1) {
      const kick = context.createOscillator()
      const level = context.createGain()
      kick.type = 'sine'
      kick.frequency.setValueAtTime(95, start + beat * (bar / 4))
      kick.frequency.exponentialRampToValueAtTime(64, start + beat * (bar / 4) + 0.18)
      level.gain.setValueAtTime(0.03, start + beat * (bar / 4))
      level.gain.exponentialRampToValueAtTime(0.0001, start + beat * (bar / 4) + 0.26)
      kick.connect(level)
      level.connect(master)
      kick.start(start + beat * (bar / 4))
      kick.stop(start + beat * (bar / 4) + 0.3)
      if (beat === 1 || beat === 3) {
        noise(context, master, ambience, start + beat * (bar / 4), 0.16, 'bandpass', 1900, 0.02, 0)
      } else {
        noise(context, master, ambience, start + beat * (bar / 4) + 0.02, 0.08, 'highpass', 5200, 0.015, 0.3)
      }
      noise(context, master, ambience, start + beat * (bar / 4) + bar / 8, 0.04, 'highpass', 7500, 0.006, beat % 2 === 0 ? 0.2 : -0.2)
    }
  }
}

function composeDune(context: OfflineAudioContext): void {
  const master = createMaster(context)
  const send = echo(context, master, 0.88, 0.4, 0.5)
  const shimmer = echo(context, master, 0.44, 0.35, 0.35)
  const ambience = noiseBuffer(context)
  const bar = (60 / 52) * 4
  const chords = [[45, 52, 57], [41, 48, 53], [43, 50, 55], [40, 47, 52]]
  const sparkle = [81, 79, 77, 79, 84, 81, 79, 77]

  // Evolving desert wind: the filter slowly sweeps across the full loop.
  const wind = context.createBufferSource()
  wind.buffer = ambience
  wind.loop = true
  const windFilter = context.createBiquadFilter()
  windFilter.type = 'bandpass'
  windFilter.Q.value = 0.5
  windFilter.frequency.setValueAtTime(420, 0)
  windFilter.frequency.linearRampToValueAtTime(900, bar * 2.5)
  windFilter.frequency.linearRampToValueAtTime(520, bar * 5)
  windFilter.frequency.linearRampToValueAtTime(760, bar * 8)
  const windLevel = context.createGain()
  windLevel.gain.setValueAtTime(0, 0)
  windLevel.gain.linearRampToValueAtTime(0.05, 1.2)
  windLevel.gain.setValueAtTime(0.05, Math.max(1.2, bar * 8 - 1.2))
  windLevel.gain.linearRampToValueAtTime(0, bar * 8)
  const windPan = context.createStereoPanner()
  windPan.pan.value = -0.35
  wind.connect(windFilter)
  windFilter.connect(windLevel)
  windLevel.connect(windPan)
  windPan.connect(master)
  wind.start(0)
  wind.stop(bar * 8 + 0.05)
  // Fine sand hiss riding above the wind.
  noise(context, master, ambience, 0, bar * 8, 'highpass', 3200, 0.006, 0.15)

  for (let chordIndex = 0; chordIndex < chords.length; chordIndex += 1) {
    const start = chordIndex * bar * 2
    const chord = chords[chordIndex]!
    for (const [index, note] of chord.entries()) {
      tone(context, master, note, start, bar * 1.9, {
        type: index === 0 ? 'sine' : 'triangle',
        gain: index === 0 ? 0.045 : 0.018,
        attack: 1.8,
        release: 2.8,
        detune: index * 3,
        pan: (index - 1) * 0.4,
      })
    }
    // Sub drone an octave below the root.
    tone(context, master, chord[0]! - 12, start, bar * 1.85, {
      type: 'sine',
      gain: 0.05,
      attack: 1.5,
      release: 2.5,
    })
    // Octave shimmer above the fifth.
    tone(context, shimmer, chord[1]! + 24, start + bar * 0.4, 0.6, {
      type: 'sine',
      gain: 0.012,
      attack: 0.05,
      release: 2.2,
      pan: -0.3,
    })
    tone(context, send, chord[2]! + 24, start + bar * 1.15, 0.5, {
      type: 'triangle',
      gain: 0.02,
      attack: 0.02,
      release: 2.4,
      detune: 4,
      pan: 0.35,
    })
    tone(context, send, chord[1]! + 31, start + bar * 1.7, 0.3, {
      type: 'sine',
      gain: 0.012,
      attack: 0.01,
      release: 2,
      detune: -4,
      pan: -0.3,
    })
  }

  for (let barIndex = 0; barIndex < 8; barIndex += 1) {
    const start = barIndex * bar
    // Soft frame-drum pulse on every downbeat, breathing in and out.
    const drum = context.createOscillator()
    const drumLevel = context.createGain()
    drum.type = 'sine'
    drum.frequency.setValueAtTime(90, start)
    drum.frequency.exponentialRampToValueAtTime(48, start + 0.35)
    drumLevel.gain.setValueAtTime(barIndex % 2 === 0 ? 0.05 : 0.032, start)
    drumLevel.gain.exponentialRampToValueAtTime(0.0001, start + 0.5)
    drum.connect(drumLevel)
    drumLevel.connect(master)
    drum.start(start)
    drum.stop(start + 0.55)
    // Sparse metallic motif, two notes per bar.
    for (let note = 0; note < 2; note += 1) {
      tone(
        context,
        shimmer,
        sparkle[(barIndex * 2 + note) % sparkle.length]!,
        start + bar * (note === 0 ? 0.25 : 0.75),
        0.35,
        {
          type: 'triangle',
          gain: 0.02,
          attack: 0.01,
          release: 1.6,
          pan: note === 0 ? 0.3 : -0.2,
        },
      )
    }
  }
}

function composeMedieval(context: OfflineAudioContext): void {
  const master = createMaster(context)
  const send = echo(context, master, 0.32, 0.3, 0.42)
  const ambience = noiseBuffer(context)
  const bar = (60 / 84) * 4
  const chords = [[50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 49, 52]]
  const melody = [74, 77, 79, 81, 79, 77, 74, 72, 74, 77, 81, 84]

  noise(context, master, ambience, 0, bar * 12, 'highpass', 1600, 0.008, 0.25)
  for (let barIndex = 0; barIndex < 12; barIndex += 1) {
    const chord = chords[barIndex % chords.length]!
    const start = barIndex * bar
    for (const [index, note] of chord.entries()) {
      tone(context, master, note, start, bar * 0.9, {
        type: 'triangle',
        gain: 0.018,
        attack: 0.35,
        release: 1.2,
        detune: index === 0 ? -5 : 5,
        pan: (index - 1) * 0.3,
      })
    }
    tone(context, master, chord[0]! - 7, start, bar * 0.9, {
      type: 'sine',
      gain: 0.028,
      attack: 0.5,
      release: 1.4,
    })
    // Low root drone grounding each bar.
    tone(context, master, chord[0]! - 12, start, bar * 0.9, {
      type: 'sine',
      gain: 0.03,
      attack: 0.7,
      release: 1.6,
    })
    for (let beat = 0; beat < 4; beat += 1) {
      if (beat === 0 || beat === 2) {
        // Frame drum: strong downbeat, softer answer.
        const drum = context.createOscillator()
        const drumLevel = context.createGain()
        drum.type = 'sine'
        drum.frequency.setValueAtTime(82, start + beat * (bar / 4))
        drum.frequency.exponentialRampToValueAtTime(46, start + beat * (bar / 4) + 0.3)
        drumLevel.gain.setValueAtTime(beat === 0 ? 0.045 : 0.028, start + beat * (bar / 4))
        drumLevel.gain.exponentialRampToValueAtTime(0.0001, start + beat * (bar / 4) + 0.45)
        drum.connect(drumLevel)
        drumLevel.connect(master)
        drum.start(start + beat * (bar / 4))
        drum.stop(start + beat * (bar / 4) + 0.5)
      }
      if (beat % 2 === 0) {
        tone(context, send, melody[(barIndex * 2 + beat / 2) % melody.length]!, start + beat * (bar / 4), 0.18, {
          type: 'triangle',
          gain: 0.032,
          attack: 0.008,
          release: 0.8,
          pan: 0.25,
        })
      }
      if (beat === 3 && barIndex % 2 === 1) {
        // Counter-melody answering an octave down on odd bars.
        tone(context, send, melody[(barIndex * 2) % melody.length]! - 12, start + beat * (bar / 4), 0.22, {
          type: 'triangle',
          gain: 0.022,
          attack: 0.01,
          release: 1,
          pan: -0.3,
        })
      }
    }
  }
}

function composeMoss(context: OfflineAudioContext): void {
  const master = createMaster(context)
  const send = echo(context, master, 0.28, 0.32, 0.5)
  const ambience = noiseBuffer(context)
  const bar = (60 / 72) * 4
  const chords = [[48, 55, 62], [46, 53, 60], [43, 50, 57], [45, 52, 59]]

  noise(context, master, ambience, 0, bar * 10, 'lowpass', 520, 0.04, -0.3)
  for (let chordIndex = 0; chordIndex < chords.length; chordIndex += 1) {
    const start = chordIndex * bar * 2.5
    const chord = chords[chordIndex]!
    for (const [index, note] of chord.entries()) {
      tone(context, master, note, start, bar * 2.3, {
        type: 'sine',
        gain: 0.04,
        attack: 1.6,
        release: 2.4,
        detune: index === 1 ? 5 : -4,
        pan: (index - 1) * 0.3,
      })
    }
    tone(context, master, chord[0]! - 12, start, bar * 2.2, {
      type: 'sine',
      gain: 0.035,
      attack: 0.9,
      release: 2,
    })
  }
  for (let barIndex = 0; barIndex < 10; barIndex += 1) {
    const chord = chords[Math.floor(barIndex / 2.5)]!
    const start = barIndex * bar
    for (let eighth = 0; eighth < 8; eighth += 1) {
      const note = chord[(barIndex + eighth) % chord.length]! + 12
      tone(context, send, note, start + eighth * (bar / 8), 0.1, {
        type: 'square',
        gain: 0.008,
        attack: 0.004,
        release: 0.18,
        pan: eighth % 2 === 0 ? 0.3 : -0.3,
      })
    }
    if (barIndex % 2 === 0) {
      tone(context, send, chord[2]! + 12, start, 0.4, {
        type: 'sine',
        gain: 0.02,
        attack: 0.03,
        release: 1.2,
        pan: -0.25,
      })
    }
  }
}

function composeTide(context: OfflineAudioContext): void {
  const master = createMaster(context)
  const send = echo(context, master, 0.5, 0.45, 0.6)
  const ambience = noiseBuffer(context)
  const bar = (60 / 60) * 4
  const chords = [[38, 45, 52], [36, 43, 50], [41, 48, 55]]
  const melody = [76, 79, 81, 79]

  noise(context, master, ambience, 0, bar * 9, 'lowpass', 380, 0.05, 0.2)
  for (let chordIndex = 0; chordIndex < chords.length; chordIndex += 1) {
    const start = chordIndex * bar * 3
    const chord = chords[chordIndex]!
    for (const [index, note] of chord.entries()) {
      tone(context, master, note, start, bar * 2.8, {
        type: index === 0 ? 'sine' : 'triangle',
        gain: index === 0 ? 0.045 : 0.016,
        attack: 2,
        release: 3,
        detune: index * 3,
        pan: (index - 1) * 0.35,
      })
    }
  }
  for (let barIndex = 0; barIndex < 9; barIndex += 1) {
    const start = barIndex * bar
    for (let ping = 0; ping < 2; ping += 1) {
      const beat = ping === 0 ? 0 : 2
      tone(context, send, ping === 0 ? 84 : 79, start + beat * (bar / 4), 0.3, {
        type: 'triangle',
        gain: 0.022,
        attack: 0.005,
        release: 1.6,
        pan: ping === 0 ? 0.35 : -0.35,
      })
    }
    if (barIndex % 3 === 1) {
      tone(context, send, melody[Math.floor(barIndex / 3) % melody.length]!, start + bar / 2, 0.4, {
        type: 'sine',
        gain: 0.018,
        attack: 0.05,
        release: 2,
        pan: 0.1,
      })
    }
  }
}

function composeLantern(context: OfflineAudioContext): void {
  const master = createMaster(context)
  const send = echo(context, master, 0.36, 0.35, 0.5)
  const ambience = noiseBuffer(context)
  const bar = (60 / 66) * 4
  const chords = [[53, 57, 60], [50, 55, 59], [48, 53, 57], [51, 55, 58]]
  const melody = [77, 81, 79, 76, 74, 76, 79, 81, 84, 79, 81, 77]

  noise(context, master, ambience, 0, bar * 10, 'highpass', 3200, 0.006, 0.15)
  noise(context, master, ambience, 0, bar * 10, 'lowpass', 300, 0.02, -0.2)
  for (let chordIndex = 0; chordIndex < chords.length; chordIndex += 1) {
    const start = chordIndex * bar * 2.5
    const chord = chords[chordIndex]!
    for (const [index, note] of chord.entries()) {
      tone(context, master, note, start, bar * 2.3, {
        type: 'triangle',
        gain: 0.02,
        attack: 1.2,
        release: 2,
        detune: index === 0 ? -5 : 5,
        pan: (index - 1) * 0.3,
      })
    }
    tone(context, master, chord[0]! - 12, start, bar * 2.2, {
      type: 'sine',
      gain: 0.03,
      attack: 0.8,
      release: 1.8,
    })
  }
  for (let barIndex = 0; barIndex < 10; barIndex += 1) {
    const start = barIndex * bar
    for (let pluck = 0; pluck < 2; pluck += 1) {
      const beat = pluck === 0 ? 0 : 2
      tone(context, send, melody[(barIndex * 2 + pluck) % melody.length]!, start + beat * (bar / 4), 0.15, {
        type: 'triangle',
        gain: 0.03,
        attack: 0.006,
        release: 0.9,
        pan: pluck === 0 ? 0.28 : -0.28,
      })
    }
  }
}

function composeAurora(context: OfflineAudioContext): void {
  const master = createMaster(context)
  const send = echo(context, master, 0.19, 0.3, 0.45)
  const ambience = noiseBuffer(context)
  const bar = (60 / 100) * 4
  const chords = [[57, 60, 64], [55, 59, 62], [53, 57, 60], [52, 55, 59]]

  noise(context, master, ambience, 0, bar * 16, 'bandpass', 1800, 0.01, 0.15)
  for (let block = 0; block < 4; block += 1) {
    const start = block * bar * 4
    const chord = chords[block]!
    for (const [index, note] of chord.entries()) {
      tone(context, master, note, start, bar * 3.7, {
        type: 'sine',
        gain: 0.03,
        attack: 0.8,
        release: 1.6,
        detune: index === 0 ? -5 : 5,
        pan: (index - 1) * 0.28,
      })
    }
    tone(context, send, chord[2]! + 24, start + bar, 0.4, {
      type: 'sine',
      gain: 0.015,
      attack: 0.04,
      release: 2,
      pan: 0.3,
    })
  }
  for (let barIndex = 0; barIndex < 16; barIndex += 1) {
    const chord = chords[barIndex % chords.length]!
    const root = chord[0]! - 24
    const start = barIndex * bar
    for (let eighth = 0; eighth < 8; eighth += 1) {
      tone(context, master, root, start + eighth * (bar / 8), 0.12, {
        type: 'sine',
        gain: 0.022,
        attack: 0.008,
        release: 0.2,
      })
      const arp = chord[(barIndex + eighth) % chord.length]! + 24
      tone(context, send, arp, start + eighth * (bar / 8), 0.06, {
        type: 'square',
        gain: 0.0075,
        attack: 0.004,
        release: 0.16,
        pan: eighth % 2 === 0 ? 0.3 : -0.3,
      })
    }
  }
}

function composeRain(context: OfflineAudioContext): void {
  const master = createMaster(context)
  const send = echo(context, master, 0.42, 0.4, 0.5)
  const ambience = noiseBuffer(context)
  const bar = (60 / 72) * 4
  const chords = [[45, 52, 57], [41, 48, 55], [43, 50, 57], [40, 47, 53]]
  const plinks = [76, 79, 81, 84, 86, 88]

  noise(context, master, ambience, 0, bar * 12, 'bandpass', 4500, 0.018, -0.2)
  noise(context, master, ambience, 0, bar * 12, 'lowpass', 400, 0.025, 0.2)
  for (let chordIndex = 0; chordIndex < chords.length; chordIndex += 1) {
    const start = chordIndex * bar * 3
    const chord = chords[chordIndex]!
    for (const [index, note] of chord.entries()) {
      tone(context, master, note, start, bar * 2.8, {
        type: 'sine',
        gain: 0.033,
        attack: 1.5,
        release: 2.2,
        detune: index === 1 ? 4 : -4,
        pan: (index - 1) * 0.3,
      })
    }
    tone(context, master, chord[0]! - 12, start, bar * 2.8, {
      type: 'sine',
      gain: 0.04,
      attack: 1.2,
      release: 2.4,
    })
  }
  for (let barIndex = 0; barIndex < 12; barIndex += 1) {
    const start = barIndex * bar
    const beats = [0, 1.5, 2.5]
    for (const [pluck, beat] of beats.entries()) {
      tone(context, send, plinks[(barIndex * 3 + pluck * 2) % plinks.length]!, start + beat * (bar / 4), 0.1, {
        type: 'sine',
        gain: 0.014,
        attack: 0.005,
        release: 0.9,
        pan: pluck % 2 === 0 ? 0.3 : -0.3,
      })
    }
  }
}

function composeNightbus(context: OfflineAudioContext): void {
  const master = createMaster(context)
  const send = echo(context, master, 0.5, 0.35, 0.45)
  const ambience = noiseBuffer(context)
  const bar = (60 / 64) * 4
  const chords = [[41, 48, 53], [39, 46, 53]]

  tone(context, master, 29, 0, bar * 10, {
    type: 'sine',
    gain: 0.02,
    attack: 3,
    release: 3,
  })
  noise(context, master, ambience, 0, bar * 10, 'lowpass', 150, 0.04, 0)
  for (let chordIndex = 0; chordIndex < chords.length; chordIndex += 1) {
    const start = chordIndex * bar * 5
    const chord = chords[chordIndex]!
    for (const [index, note] of chord.entries()) {
      tone(context, master, note, start, bar * 4.8, {
        type: 'triangle',
        gain: 0.015,
        attack: 1.2,
        release: 2.4,
        detune: index * 3,
        pan: (index - 1) * 0.3,
      })
    }
  }
  for (let barIndex = 0; barIndex < 10; barIndex += 1) {
    const start = barIndex * bar
    if (barIndex % 2 === 0) {
      tone(context, master, 29, start, 0.3, {
        type: 'sine',
        gain: 0.03,
        attack: 0.02,
        release: 0.5,
      })
    }
    if (barIndex === 2 || barIndex === 7) {
      tone(context, send, 81, start + bar / 4, 0.35, {
        type: 'sine',
        gain: 0.02,
        attack: 0.01,
        release: 1.5,
        pan: 0.2,
      })
      tone(context, send, 76, start + bar / 4 + 0.45, 0.4, {
        type: 'sine',
        gain: 0.02,
        attack: 0.01,
        release: 1.8,
        pan: 0.2,
      })
    }
  }
}

function composeMeadow(context: OfflineAudioContext): void {
  const master = createMaster(context)
  const send = echo(context, master, 0.4, 0.35, 0.5)
  const ambience = noiseBuffer(context)
  const bar = (60 / 80) * 4
  const chords = [[53, 57, 60], [55, 59, 62], [52, 57, 60], [50, 54, 59]]
  const melody = [77, 79, 81, 79, 84, 81, 79, 77, 76, 74, 76, 79]

  noise(context, master, ambience, 0, bar * 12, 'bandpass', 900, 0.025, -0.2)
  noise(context, master, ambience, 0, bar * 12, 'highpass', 5000, 0.005, 0.2)
  for (let chordIndex = 0; chordIndex < chords.length; chordIndex += 1) {
    const start = chordIndex * bar * 3
    const chord = chords[chordIndex]!
    for (const [index, note] of chord.entries()) {
      tone(context, master, note, start, bar * 2.8, {
        type: 'triangle',
        gain: 0.018,
        attack: 1,
        release: 1.8,
        detune: index === 0 ? -4 : 4,
        pan: (index - 1) * 0.3,
      })
    }
    tone(context, master, chord[0]! - 12, start, bar * 2.8, {
      type: 'sine',
      gain: 0.028,
      attack: 0.9,
      release: 2,
    })
  }
  for (let barIndex = 0; barIndex < 12; barIndex += 1) {
    const start = barIndex * bar
    for (let pluck = 0; pluck < 2; pluck += 1) {
      const beat = pluck === 0 ? 0 : 2
      tone(context, send, melody[(barIndex * 2 + pluck) % melody.length]!, start + beat * (bar / 4), 0.14, {
        type: 'triangle',
        gain: 0.028,
        attack: 0.006,
        release: 0.8,
        pan: pluck === 0 ? 0.28 : -0.28,
      })
    }
  }
}

function composeVapor(context: OfflineAudioContext): void {
  const master = createMaster(context)
  const send = echo(context, master, 0.36, 0.4, 0.5)
  const ambience = noiseBuffer(context)
  const bar = (60 / 90) * 4
  const chords = [[45, 48, 52], [43, 47, 50], [41, 45, 48], [43, 47, 52]]

  noise(context, master, ambience, 0, bar * 15, 'lowpass', 500, 0.02, 0)
  for (let chordIndex = 0; chordIndex < chords.length; chordIndex += 1) {
    const start = chordIndex * bar * 3.75
    const chord = chords[chordIndex]!
    for (const [index, note] of chord.entries()) {
      tone(context, master, note, start, bar * 3.5, {
        type: 'sine',
        gain: 0.035,
        attack: 2.2,
        release: 2.4,
        detune: index === 0 ? -4 : 4,
        pan: (index - 1) * 0.28,
      })
    }
    tone(context, master, chord[0]! - 12, start, bar * 3.5, {
      type: 'sine',
      gain: 0.04,
      attack: 1.5,
      release: 2.5,
    })
  }
  for (let barIndex = 0; barIndex < 15; barIndex += 1) {
    const chord = chords[barIndex % chords.length]!
    const start = barIndex * bar
    for (let eighth = 0; eighth < 8; eighth += 1) {
      const arp = chord[(barIndex + eighth) % chord.length]! + 12
      tone(context, send, arp, start + eighth * (bar / 8), 0.08, {
        type: 'square',
        gain: 0.008,
        attack: 0.005,
        release: 0.2,
        pan: eighth % 2 === 0 ? 0.3 : -0.3,
      })
      if (eighth % 2 === 0) {
        tone(context, master, chord[0]! - 12, start + eighth * (bar / 8), 0.1, {
          type: 'sine',
          gain: 0.02,
          attack: 0.01,
          release: 0.25,
        })
      }
    }
  }
}

function passingVehicle(
  context: AudioContext,
  master: GainNode,
  buffer: AudioBuffer,
  at: number,
  peak: number,
  duration: number,
  gain: number,
  pan: number,
): void {
  const source = context.createBufferSource()
  const filter = context.createBiquadFilter()
  const level = context.createGain()
  const panner = context.createStereoPanner()
  source.buffer = buffer
  source.loop = true
  filter.type = 'bandpass'
  filter.Q.value = 1.2
  filter.frequency.setValueAtTime(peak * 0.3, at)
  filter.frequency.linearRampToValueAtTime(peak, at + duration / 2)
  filter.frequency.linearRampToValueAtTime(peak * 0.3, at + duration)
  level.gain.setValueAtTime(0, at)
  level.gain.linearRampToValueAtTime(gain, at + duration / 2)
  level.gain.linearRampToValueAtTime(0, at + duration)
  panner.pan.value = pan
  source.connect(filter)
  filter.connect(level)
  level.connect(panner)
  panner.connect(master)
  source.start(at)
  source.stop(at + duration + 0.1)
}

function bee(context: AudioContext, master: GainNode, at: number, duration: number, pan: number): void {
  const osc = context.createOscillator()
  const lfo = context.createOscillator()
  const lfoGain = context.createGain()
  const level = context.createGain()
  const panner = context.createStereoPanner()
  osc.type = 'sawtooth'
  osc.frequency.value = 190 + Math.random() * 40
  lfo.type = 'sine'
  lfo.frequency.value = 4 + Math.random() * 3
  lfoGain.gain.value = 15
  lfo.connect(lfoGain)
  lfoGain.connect(osc.frequency)
  level.gain.setValueAtTime(0, at)
  level.gain.linearRampToValueAtTime(0.006, at + 0.8)
  level.gain.setValueAtTime(0.006, at + Math.max(0.8, duration - 0.8))
  level.gain.linearRampToValueAtTime(0, at + duration)
  panner.pan.value = pan
  osc.connect(level)
  level.connect(panner)
  panner.connect(master)
  osc.start(at)
  lfo.start(at)
  osc.stop(at + duration + 0.05)
  lfo.stop(at + duration + 0.05)
}

function spaceEnv(context: AudioContext, master: GainNode): () => void {
  const stops = [
    every(context, 3, 9, (at) => {
      tone(context, master, 60 + Math.floor(Math.random() * 24), at, 0.08, {
        type: 'square',
        gain: 0.006,
        attack: 0.005,
        release: 0.3,
        pan: (Math.random() - 0.5) * 0.9,
      })
    }),
    every(context, 12, 24, (at) => {
      tone(context, master, 31, at, 5, {
        type: 'sine',
        gain: 0.012,
        attack: 2,
        release: 3,
      })
    }),
  ]
  return () => stops.forEach((stop) => stop())
}

function cyberpunkEnv(context: AudioContext, master: GainNode): () => void {
  const buffer = noiseBuffer(context)
  const beds = [liveBed(context, master, buffer, 'highpass', 6000, 0.007, 0)]
  const stops = [
    every(context, 25, 50, (at) => {
      gliss(context, master, at, 620, 920, 2.2, 'sine', 0.006, -0.4)
      gliss(context, master, at + 2.4, 920, 620, 2.2, 'sine', 0.006, -0.4)
    }),
    every(context, 30, 70, (at) => {
      liveBurst(context, master, buffer, at, 4, 'lowpass', 120, 0.03, -0.1, 1.5)
    }),
    every(context, 6, 14, (at) => {
      tone(context, master, 108, at, 0.05, {
        type: 'sawtooth',
        gain: 0.004,
        attack: 0.01,
        release: 0.2,
        pan: 0.4,
      })
    }),
  ]
  return () => {
    stops.forEach((stop) => stop())
    beds.forEach((stop) => stop())
  }
}

function duneEnv(context: AudioContext, master: GainNode): () => void {
  const buffer = noiseBuffer(context)
  const send = echo(context, master, 0.88, 0.4, 0.5)
  const stops = [
    every(context, 7, 16, (at) => {
      liveBurst(context, master, buffer, at, 4 + Math.random() * 3, 'bandpass', 300 + Math.random() * 400, 0.02, (Math.random() - 0.5) * 0.8, 1.5)
    }),
    every(context, 20, 40, (at) => {
      bell(context, send, at, [88, 91, 86][Math.floor(Math.random() * 3)]!, 0.014)
    }),
    every(context, 5, 12, (at) => {
      const count = 3 + Math.floor(Math.random() * 3)
      for (let i = 0; i < count; i += 1) {
        liveBurst(context, master, buffer, at + i * (0.07 + Math.random() * 0.05), 0.06, 'highpass', 5000, 0.008, 0.2)
      }
    }),
  ]
  return () => stops.forEach((stop) => stop())
}

function medievalEnv(context: AudioContext, master: GainNode): () => void {
  const buffer = noiseBuffer(context)
  const send = echo(context, master, 0.5, 0.35, 0.4)
  const stops = [
    every(context, 0.2, 0.8, (at) => {
      liveBurst(context, master, buffer, at, 0.03 + Math.random() * 0.06, 'bandpass', 1500 + Math.random() * 2000, 0.004 + Math.random() * 0.008, (Math.random() - 0.5) * 0.6)
    }),
    every(context, 10, 22, (at) => {
      liveBurst(context, master, buffer, at, 3 + Math.random() * 2, 'lowpass', 400, 0.02, 0, 1.5)
    }),
    every(context, 25, 55, (at) => {
      const pan = (Math.random() - 0.5) * 0.8
      tone(context, send, 65, at, 0.25, { type: 'sine', gain: 0.012, attack: 0.03, release: 0.3, pan })
      tone(context, send, 62, at + 0.45, 0.35, { type: 'sine', gain: 0.012, attack: 0.03, release: 0.4, pan })
    }),
    every(context, 40, 80, (at) => {
      bell(context, send, at, [69, 65, 67][Math.floor(Math.random() * 3)]!, 0.012)
    }),
  ]
  return () => stops.forEach((stop) => stop())
}

function mossEnv(context: AudioContext, master: GainNode): () => void {
  const buffer = noiseBuffer(context)
  const stops = [
    every(context, 4, 12, (at) => {
      let time = at
      const count = 2 + Math.floor(Math.random() * 4)
      const base = 2400 + Math.random() * 800
      const pan = (Math.random() - 0.5) * 0.9
      for (let i = 0; i < count; i += 1) {
        gliss(context, master, time, base, base + 600 + Math.random() * 600, 0.12 + Math.random() * 0.13, 'sine', 0.008, pan)
        time += 0.15 + Math.random() * 0.15
      }
    }),
    every(context, 6, 14, (at) => {
      liveBurst(context, master, buffer, at, 1 + Math.random() * 1.5, 'bandpass', 2000, 0.012, (Math.random() - 0.5) * 0.7, 0.5)
    }),
    every(context, 20, 45, (at) => {
      liveBurst(context, master, buffer, at, 0.05, 'highpass', 2500, 0.02, (Math.random() - 0.5) * 0.8)
    }),
  ]
  return () => stops.forEach((stop) => stop())
}

function tideEnv(context: AudioContext, master: GainNode): () => void {
  const buffer = noiseBuffer(context)
  const send = echo(context, master, 0.6, 0.4, 0.5)
  const stops = [
    every(context, 9, 20, (at) => {
      const base = 1300 + Math.random() * 300
      const pan = (Math.random() - 0.5) * 0.9
      const cries = 2 + Math.floor(Math.random() * 2)
      for (let i = 0; i < cries; i += 1) {
        gliss(context, send, at + i * 0.5, base, base * 0.65, 0.4, 'sine', 0.01, pan)
      }
    }),
    every(context, 10, 22, (at) => {
      liveBurst(context, master, buffer, at, 4 + Math.random() * 3, 'lowpass', 500, 0.035, 0, 2)
    }),
    every(context, 30, 60, (at) => {
      bell(context, send, at, 76, 0.01)
    }),
  ]
  return () => stops.forEach((stop) => stop())
}

function lanternEnv(context: AudioContext, master: GainNode): () => void {
  const buffer = noiseBuffer(context)
  const send = echo(context, master, 0.5, 0.4, 0.5)
  const stops = [
    every(context, 5, 12, (at) => {
      const pulses = 3 + Math.floor(Math.random() * 4)
      const pan = (Math.random() - 0.5) * 0.9
      for (let i = 0; i < pulses; i += 1) {
        tone(context, master, 96, at + i * 0.09, 0.05, {
          type: 'sine',
          gain: 0.005,
          attack: 0.005,
          release: 0.05,
          pan,
        })
      }
    }),
    every(context, 12, 25, (at) => {
      liveBurst(context, master, buffer, at, 3 + Math.random() * 2, 'lowpass', 600, 0.015, 0, 1.5)
    }),
    every(context, 30, 70, (at) => {
      bell(context, send, at, [81, 79, 77, 84][Math.floor(Math.random() * 4)]!, 0.01)
    }),
  ]
  return () => stops.forEach((stop) => stop())
}

function auroraEnv(context: AudioContext, master: GainNode): () => void {
  const buffer = noiseBuffer(context)
  const send = echo(context, master, 0.6, 0.4, 0.5)
  const stops = [
    every(context, 8, 18, (at) => {
      liveBurst(context, master, buffer, at, 3 + Math.random() * 2, 'bandpass', 800, 0.018, (Math.random() - 0.5) * 0.7, 1.5)
    }),
    every(context, 15, 35, (at) => {
      liveBurst(context, master, buffer, at, 0.12, 'highpass', 3000, 0.02, (Math.random() - 0.5) * 0.6)
      tone(context, master, 33, at, 0.2, { type: 'sine', gain: 0.03, attack: 0.01, release: 0.4 })
    }),
    every(context, 25, 55, (at) => {
      bell(context, send, at, [77, 79, 81, 84, 86][Math.floor(Math.random() * 5)]!, 0.01)
    }),
  ]
  return () => stops.forEach((stop) => stop())
}

function rainEnv(context: AudioContext, master: GainNode): () => void {
  const buffer = noiseBuffer(context)
  const beds = [
    liveBed(context, master, buffer, 'highpass', 5000, 0.012, 0),
    liveBed(context, master, buffer, 'lowpass', 400, 0.02, 0),
  ]
  const stops = [
    every(context, 20, 50, (at) => {
      liveBurst(context, master, buffer, at, 3 + Math.random() * 3, 'lowpass', 90, 0.05, 0, 0.8)
    }),
    every(context, 2, 7, (at) => {
      tone(context, master, 80 + Math.floor(Math.random() * 12), at, 0.05, {
        type: 'sine',
        gain: 0.01,
        attack: 0.005,
        release: 0.5,
        pan: (Math.random() - 0.5) * 0.9,
      })
    }),
  ]
  return () => {
    stops.forEach((stop) => stop())
    beds.forEach((stop) => stop())
  }
}

function nightbusEnv(context: AudioContext, master: GainNode): () => void {
  const buffer = noiseBuffer(context)
  const beds = [
    liveDrone(context, master, 29, 0.018),
    liveBed(context, master, buffer, 'lowpass', 120, 0.035, 0),
    liveBed(context, master, buffer, 'highpass', 7000, 0.004, 0.2),
  ]
  const stops = [
    every(context, 18, 40, (at) => {
      passingVehicle(context, master, buffer, at, 900 + Math.random() * 500, 3.5, 0.02, (Math.random() - 0.5) * 0.9)
    }),
    every(context, 45, 90, (at) => {
      tone(context, master, 81, at, 0.35, { type: 'sine', gain: 0.016, attack: 0.01, release: 1.5, pan: 0.2 })
      tone(context, master, 76, at + 0.5, 0.4, { type: 'sine', gain: 0.016, attack: 0.01, release: 1.8, pan: 0.2 })
    }),
  ]
  return () => {
    stops.forEach((stop) => stop())
    beds.forEach((stop) => stop())
  }
}

function meadowEnv(context: AudioContext, master: GainNode): () => void {
  const buffer = noiseBuffer(context)
  const stops = [
    every(context, 10, 25, (at) => {
      bee(context, master, at, 2 + Math.random() * 2, (Math.random() - 0.5) * 0.9)
    }),
    every(context, 6, 14, (at) => {
      let time = at
      const count = 2 + Math.floor(Math.random() * 3)
      const base = 2800 + Math.random() * 600
      const pan = (Math.random() - 0.5) * 0.9
      for (let i = 0; i < count; i += 1) {
        gliss(context, master, time, base, base + 400 + Math.random() * 500, 0.1 + Math.random() * 0.1, 'sine', 0.007, pan)
        time += 0.14 + Math.random() * 0.12
      }
    }),
    every(context, 12, 24, (at) => {
      liveBurst(context, master, buffer, at, 2 + Math.random() * 2, 'bandpass', 1000, 0.014, 0, 1)
    }),
  ]
  return () => stops.forEach((stop) => stop())
}

function vaporEnv(context: AudioContext, master: GainNode): () => void {
  const buffer = noiseBuffer(context)
  const beds = [
    liveDrone(context, master, 36, 0.006),
    liveDrone(context, master, 48, 0.003),
    liveBed(context, master, buffer, 'lowpass', 300, 0.012, 0),
  ]
  const stops = [
    every(context, 15, 35, (at) => {
      passingVehicle(context, master, buffer, at, 700 + Math.random() * 300, 4, 0.015, (Math.random() - 0.5) * 0.8)
    }),
    every(context, 0.4, 1.2, (at) => {
      liveBurst(context, master, buffer, at, 0.02, 'highpass', 4000, 0.003, (Math.random() - 0.5) * 0.8)
    }),
    every(context, 60, 120, (at) => {
      liveBurst(context, master, buffer, at, 4, 'lowpass', 100, 0.04, 0, 1)
    }),
  ]
  return () => {
    stops.forEach((stop) => stop())
    beds.forEach((stop) => stop())
  }
}

const SPECS: Record<AmbienceId, { seconds: number; compose: (context: OfflineAudioContext) => void; env: EnvStarter }> = {
  space: { seconds: (60 / 58) * 4 * 8, compose: composeSpace, env: spaceEnv },
  cyberpunk: { seconds: (60 / 96) * 4 * 16, compose: composeCyberpunk, env: cyberpunkEnv },
  dune: { seconds: (60 / 52) * 4 * 8, compose: composeDune, env: duneEnv },
  'medieval-scifi': { seconds: (60 / 84) * 4 * 12, compose: composeMedieval, env: medievalEnv },
  moss: { seconds: (60 / 72) * 4 * 10, compose: composeMoss, env: mossEnv },
  tide: { seconds: (60 / 60) * 4 * 9, compose: composeTide, env: tideEnv },
  lantern: { seconds: (60 / 66) * 4 * 10, compose: composeLantern, env: lanternEnv },
  aurora: { seconds: (60 / 100) * 4 * 16, compose: composeAurora, env: auroraEnv },
  rain: { seconds: (60 / 72) * 4 * 12, compose: composeRain, env: rainEnv },
  nightbus: { seconds: (60 / 64) * 4 * 10, compose: composeNightbus, env: nightbusEnv },
  meadow: { seconds: (60 / 80) * 4 * 12, compose: composeMeadow, env: meadowEnv },
  vapor: { seconds: (60 / 90) * 4 * 15, compose: composeVapor, env: vaporEnv },
}

const bufferCache = new Map<AmbienceId, Promise<AudioBuffer>>()

async function render(theme: AmbienceId): Promise<AudioBuffer> {
  const spec = SPECS[theme]
  const context = new OfflineAudioContext(2, Math.ceil(44100 * spec.seconds), 44100)
  spec.compose(context)
  return context.startRendering()
}

function getBuffer(theme: AmbienceId): Promise<AudioBuffer> {
  const cached = bufferCache.get(theme)
  if (cached) return cached
  const pending = render(theme).catch((error) => {
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

export async function startAmbience(theme: AmbienceId): Promise<void> {
  const token = ++generation
  current?.stop()
  current = null
  const buffer = await getBuffer(theme)
  if (token !== generation) return
  current = new Playback(buffer, SPECS[theme].env)
}

export function stopAmbience(): void {
  generation += 1
  current?.stop()
  current = null
}
