import {
  tone,
  noise,
  noiseBuffer,
  echo,
  gliss,
  bell,
  liveBurst,
  every,
  createMaster,
} from './engine'
import type { AmbienceSpec } from './engine'

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

export const tideSpec: AmbienceSpec = {
  seconds: (60 / 60) * 4 * 9,
  compose: composeTide,
  env: tideEnv,
}
