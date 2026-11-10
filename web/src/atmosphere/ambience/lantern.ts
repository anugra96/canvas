import {
  tone,
  noise,
  noiseBuffer,
  echo,
  bell,
  liveBurst,
  every,
  createMaster,
} from './engine'
import type { AmbienceSpec } from './engine'

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

export const lanternSpec: AmbienceSpec = {
  seconds: (60 / 66) * 4 * 10,
  compose: composeLantern,
  env: lanternEnv,
}
