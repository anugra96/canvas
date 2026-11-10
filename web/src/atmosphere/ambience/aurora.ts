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

export const auroraSpec: AmbienceSpec = {
  seconds: (60 / 100) * 4 * 16,
  compose: composeAurora,
  env: auroraEnv,
}
