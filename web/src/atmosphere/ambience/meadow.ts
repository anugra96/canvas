import {
  tone,
  noise,
  noiseBuffer,
  echo,
  gliss,
  liveBurst,
  every,
  createMaster,
} from './engine'
import type { AmbienceSpec } from './engine'

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

export const meadowSpec: AmbienceSpec = {
  seconds: (60 / 80) * 4 * 12,
  compose: composeMeadow,
  env: meadowEnv,
}
