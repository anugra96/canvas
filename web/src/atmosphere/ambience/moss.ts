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

export const mossSpec: AmbienceSpec = {
  seconds: (60 / 72) * 4 * 10,
  compose: composeMoss,
  env: mossEnv,
}
