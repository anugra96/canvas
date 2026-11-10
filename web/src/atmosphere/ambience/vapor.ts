import {
  tone,
  noise,
  noiseBuffer,
  echo,
  liveBurst,
  liveBed,
  liveDrone,
  every,
  createMaster,
  passingVehicle,
} from './engine'
import type { AmbienceSpec } from './engine'

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

export const vaporSpec: AmbienceSpec = {
  seconds: (60 / 90) * 4 * 15,
  compose: composeVapor,
  env: vaporEnv,
}
